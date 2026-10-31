// SVC D.19 ▸ รายงานหลักหอ — ลูกหนี้ตามอายุ · อัตราเข้าพักรายเดือน · รายได้แยกประเภท · ส่งออก CSV
//   สัญญา ledger/svc-briefs/svc-brief-d.19.md §2 (มติ) §3 (สัญญาโค้ด) · มติผู้คุม R1–R10 (31 ต.ค. 2569)
//   • อ่านอย่างเดียว: ไม่มีการเขียนฐาน/อีเวนต์/audit ใด ๆ ในไฟล์นี้ (W-1)
//   • ยอดค้าง = billBalances(...).ownOutstandingSatang ต่อบิล (นิยามเดียว D.10 · R1: ไม่ใช้ตัวรวมยอดค้างต่อผู้ติดต่อ/รายงานอายุหนี้ของบัญชี
//     เพราะไม่หักใบลดหนี้/ไม่นับใบเพิ่มหนี้ ISSUED) — ข้อสอบเทียบกับ GL 1100 ของเอกสารบิลทุกสตางค์
//   • ด่าน (X1): Membership สด + หน่วย DORM ของร้าน + dormAccess().board && .money · ไม่ผ่าน ⇒ NOT_FOUND ไบต์เดียวกันทุกกรณี · ตรวจด่านก่อนอินพุต
//   • ขอบเขตอาคาร (#64): ห้องที่ dormScopeFor/dormVisibleRoomIds เห็น (null = ทั้งหน่วย · เซตว่าง = ศูนย์ทุกตัว)
//   • วันไทยจาก bkkYmd (ไม่อ่านชิ้นเวลาตามเครื่อง) · นับวันเข้าพักด้วย occupiedDays/daysInMonth
//   • คิวรีชุด (ไม่ N+1): บิลทั้งหน่วยครั้งเดียว · billBalances/billPaidSatang/dormDocsDead ทั้งชุดครั้งเดียว · ใบปรับยอดครั้งเดียว
//   • เพดานแถว/เดือนอ่านจากทะเบียนค่าตั้ง (rooms.report.exportMaxRows · rooms.report.maxMonths) ทุกคำขอ — ไม่ฝังตัวเลข
import { tenantDb } from "@/lib/core/db";
import { csvRow } from "@/lib/core/csv";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings } from "@/lib/core/settings";
import { dormDocsDead } from "@/lib/modules/account";
import { dormAccess } from "./access";
import { billBalances, billPaidSatang } from "./balance";
import { daysInMonth, occupiedDays } from "./calc";
import { dormLiveMember, dormScopeFor, dormUnitOf, dormVisibleRoomIds } from "./scope";

// ───────────────────────── สัญญา §3 ─────────────────────────
export const DORM_REPORT_NF_REASON = "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ดูรายงานการเงินของหอ";
export const DORM_REVENUE_TYPES = ["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE", "OTHER", "ADJUST"] as const;
export type DormRevenueType = (typeof DORM_REVENUE_TYPES)[number];
export type DormReportCtx = { tenantId: string; actorUserId: string };
export type DormReportFailCode = "NOT_FOUND" | "INVALID_INPUT" | "TOO_LARGE";
export type DormReportFail = { ok: false; code: DormReportFailCode; reason: string };
export type DormAgingBucket = "notDue" | "d1_30" | "d31_60" | "d61_90" | "d90plus";
export type DormAgingBuckets = { notDueSatang: number; d1_30Satang: number; d31_60Satang: number; d61_90Satang: number; d90plusSatang: number; totalSatang: number };
export type DormAgingBill = { billId: string; periodKey: string; dueDate: string | null; daysLate: number; bucket: DormAgingBucket; outstandingSatang: number; hasDoc: boolean };
export type DormAgingRow = { leaseId: string; partyId: string; roomId: string; roomNumber: string; buildingId: string | null; tenantFirstName: string | null; buckets: DormAgingBuckets; bills: DormAgingBill[] };
export type DormAgingReport = { asOf: string; buckets: DormAgingBuckets; rows: DormAgingRow[]; noDocSatang: number };
export type DormOccupancyMonth = { month: string; rooms: number; days: number; roomDays: number; occupiedRoomDays: number; rateBp: number };
export type DormOccupancyReport = { months: DormOccupancyMonth[]; averageBp: number };
export type DormMoney3 = { netSatang: number; vatSatang: number; grossSatang: number };
export type DormRevenueMonth = { periodKey: string; bills: number; noDocBills: number; types: Record<DormRevenueType, DormMoney3>; total: DormMoney3; collectedSatang: number };
export type DormRevenueReport = { months: DormRevenueMonth[]; grand: { types: Record<DormRevenueType, DormMoney3>; total: DormMoney3; collectedSatang: number } };
export type DormReportRange = "MONTH" | "6M" | "YEAR";
export type DormReportModel = {
  unitId: string;
  unitName: string;
  range: DormReportRange;
  fromMonth: string;
  toMonth: string;
  asOf: string;
  aging: DormAgingReport;
  occupancy: DormOccupancyReport;
  revenue: DormRevenueReport;
  kpi: {
    occupancyAvgBp: number;
    occupancyCurrentBp: number;
    collected: { periodKey: string; billedGrossSatang: number; collectedSatang: number; rateBp: number };
    overdue: { satang: number; rooms: number };
  };
};
export type DormReportCsvKind = "AGING" | "OCCUPANCY" | "REVENUE";

// ───────────────────────── ตัวช่วย ─────────────────────────
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const DAY_MS = 86_400_000;
const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const LEASE_COUNTED = ["ACTIVE", "NOTICE", "ENDED"];
const ADJUST_REF = "DormBillAdjust";
const DOC_DEAD = ["DRAFT", "VOIDED", "CANCELLED"];
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const KEY_MAX_ROWS = "rooms.report.exportMaxRows";
const KEY_MAX_MONTHS = "rooms.report.maxMonths";
const RANGES: readonly DormReportRange[] = ["MONTH", "6M", "YEAR"];
const CSV_KINDS: readonly DormReportCsvKind[] = ["AGING", "OCCUPANCY", "REVENUE"];
const BOM = "﻿";

const notFound = (): DormReportFail => ({ ok: false, code: "NOT_FOUND", reason: DORM_REPORT_NF_REASON });
const invalid = (reason: string): DormReportFail => ({ ok: false, code: "INVALID_INPUT", reason });
const nowOf = (d: unknown): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
/** วันที่ในฐาน (@db.Date = เที่ยงคืน UTC) ⇒ "YYYY-MM-DD" */
const ymdOfDb = (d: Date | null | undefined): string | null => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null);
const dayNo = (ymd: string): number => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
const monthIndex = (ym: string): number => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const monthOfIndex = (i: number): string => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const monthAdd = (ym: string, n: number): string => monthOfIndex(monthIndex(ym) + n);
const monthsOf = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let i = monthIndex(from); i <= monthIndex(to); i++) out.push(monthOfIndex(i));
  return out;
};
/** ปัดครึ่งขึ้น (จำนวนเต็มไม่ติดลบ) · ตัวหาร ≤ 0 ⇒ 0 */
const ratioBp = (num: number, den: number): number => (den > 0 && num > 0 ? Math.floor((num * 20_000 + den) / (den * 2)) : 0);
const int = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) ? v : 0);
const zero3 = (): DormMoney3 => ({ netSatang: 0, vatSatang: 0, grossSatang: 0 });
const add3 = (a: DormMoney3, b: DormMoney3, sign = 1): void => {
  a.netSatang += sign * b.netSatang;
  a.vatSatang += sign * b.vatSatang;
  a.grossSatang += sign * b.grossSatang;
};
const zeroTypes = (): Record<DormRevenueType, DormMoney3> =>
  Object.fromEntries(DORM_REVENUE_TYPES.map((t) => [t, zero3()])) as Record<DormRevenueType, DormMoney3>;
const typeOfCode = (code: unknown): DormRevenueType =>
  code === "RENT" || code === "COMMON" || code === "ELEC" || code === "WATER" || code === "LATE_FEE" ? code : "OTHER";
const emptyBuckets = (): DormAgingBuckets => ({ notDueSatang: 0, d1_30Satang: 0, d31_60Satang: 0, d61_90Satang: 0, d90plusSatang: 0, totalSatang: 0 });
const bucketOf = (daysLate: number): DormAgingBucket =>
  daysLate <= 0 ? "notDue" : daysLate <= 30 ? "d1_30" : daysLate <= 60 ? "d31_60" : daysLate <= 90 ? "d61_90" : "d90plus";
const BUCKET_FIELD: Record<DormAgingBucket, Exclude<keyof DormAgingBuckets, "totalSatang">> = {
  notDue: "notDueSatang",
  d1_30: "d1_30Satang",
  d31_60: "d31_60Satang",
  d61_90: "d61_90Satang",
  d90plus: "d90plusSatang",
};
const addBucket = (b: DormAgingBuckets, k: DormAgingBucket, v: number): void => {
  b[BUCKET_FIELD[k]] += v;
  b.totalSatang += v;
};
const roomCmp = (a: string, b: string): number => a.localeCompare(b, "th", { numeric: true });
const firstName = (name: unknown): string | null => {
  if (typeof name !== "string") return null;
  const t = name.trim().split(/\s+/)[0];
  return t ? t : null;
};
/** สตางค์ ⇒ บาททศนิยม 2 ตำแหน่ง (สตริงตัวเลขล้วน เช่น "4800.00" "-50.00") */
const bahtStr = (satang: number): string => {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};
/** basis point ⇒ เปอร์เซ็นต์ 2 ตำแหน่ง ("86.11") */
const pctStr = (bp: number): string => `${Math.trunc(bp / 100)}.${String(Math.abs(bp % 100)).padStart(2, "0")}`;

// ───────────────────────── ด่าน + ขอบเขต ─────────────────────────
type Gate = { tenantId: string; unitId: string; unitName: string; rooms: Set<string> | null; today: string };

/** X1 ▸ ด่านเดียวของทุกฟังก์ชัน — ไม่ผ่าน ⇒ null (ผู้เรียกตอบ NOT_FOUND ไบต์เดียวกัน) */
async function gateOf(ctx: unknown, input: unknown, now: Date): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isRec(input) || !isStr(input.unitId)) return null;
  const tenantId = ctx.tenantId;
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit) return null;
  const mem = await dormLiveMember(tenantId, ctx.actorUserId);
  if (!mem) return null;
  const acc = dormAccess(mem.ctx, unit.id);
  if (!acc.board || !acc.money) return null;
  const rooms = await dormVisibleRoomIds(tenantId, unit.id, await dormScopeFor(tenantId, unit.id, mem));
  return { tenantId, unitId: unit.id, unitName: unit.name, rooms, today: bkkYmd(now) };
}

/** เพดานจากทะเบียนค่าตั้ง (ชั้น TENANT · อ่านสดทุกคำขอ) */
async function limitsOf(g: Gate): Promise<{ maxRows: number; maxMonths: number } | null> {
  const r = await resolveSettings({ tenantId: g.tenantId }, [KEY_MAX_ROWS, KEY_MAX_MONTHS], { unitId: g.unitId });
  const maxRows = r[KEY_MAX_ROWS]?.value;
  const maxMonths = r[KEY_MAX_MONTHS]?.value;
  if (typeof maxRows !== "number" || !Number.isInteger(maxRows) || maxRows < 1) return null;
  if (typeof maxMonths !== "number" || !Number.isInteger(maxMonths) || maxMonths < 1) return null;
  return { maxRows, maxMonths };
}

/** ช่วงเดือน: YYYY-MM · from ≤ to · to ≤ เดือนถัดไปของวันนี้ไทย · จำนวนเดือน ≤ maxMonths */
function checkRange(from: unknown, to: unknown, today: string, maxMonths: number): { from: string; to: string } | DormReportFail {
  if (typeof from !== "string" || typeof to !== "string" || !MONTH_RE.test(from) || !MONTH_RE.test(to)) return invalid("รูปแบบเดือนต้องเป็น ปปปป-ดด (เช่น 2026-11)");
  if (from > to) return invalid("เดือนเริ่มต้องไม่หลังเดือนสุดท้าย");
  if (to > monthAdd(today.slice(0, 7), 1)) return invalid("เลือกได้ไม่เกินเดือนถัดไป");
  if (monthIndex(to) - monthIndex(from) + 1 > maxMonths) return invalid(`ช่วงรายงานยาวได้ไม่เกิน ${maxMonths} เดือน`);
  return { from, to };
}

/** ช่วงตามปุ่ม (MONTH · 6M · YEAR) — ยาวกว่า maxMonths ⇒ ตัดต้นช่วง */
function rangeOf(range: DormReportRange, today: string, maxMonths: number): { from: string; to: string } {
  const to = today.slice(0, 7);
  let from = range === "MONTH" ? to : range === "6M" ? monthAdd(to, -5) : `${to.slice(0, 4)}-01`;
  if (monthIndex(to) - monthIndex(from) + 1 > maxMonths) from = monthAdd(to, -(maxMonths - 1));
  return { from, to };
}

// ───────────────────────── ลูกหนี้ตามอายุ ─────────────────────────
async function agingOf(g: Gate): Promise<DormAgingReport> {
  const out: DormAgingReport = { asOf: g.today, buckets: emptyBuckets(), rows: [], noDocSatang: 0 };
  if (g.rooms && g.rooms.size === 0) return out;
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const bills = await db.dormBill.findMany({
    where: { status: { in: SENTISH }, ...(g.rooms ? { roomId: { in: [...g.rooms] } } : {}) },
    select: { id: true, leaseId: true, roomId: true, periodKey: true, dueDate: true, accountDocumentId: true },
    orderBy: [{ periodKey: "asc" }, { id: "asc" }],
  });
  if (!bills.length) return out;
  const bal = await billBalances(g.tenantId, bills.map((b) => b.id));
  const todayNo = dayNo(g.today);
  const per = new Map<string, { roomId: string; buckets: DormAgingBuckets; bills: DormAgingBill[] }>();
  for (const b of bills) {
    const own = bal.get(b.id)?.ownOutstandingSatang ?? 0;
    if (own <= 0) continue;
    const due = ymdOfDb(b.dueDate);
    const daysLate = due ? todayNo - dayNo(due) : 0;
    const bucket = bucketOf(daysLate);
    const row = per.get(b.leaseId) ?? { roomId: b.roomId, buckets: emptyBuckets(), bills: [] };
    addBucket(row.buckets, bucket, own);
    addBucket(out.buckets, bucket, own);
    row.bills.push({ billId: b.id, periodKey: b.periodKey, dueDate: due, daysLate, bucket, outstandingSatang: own, hasDoc: !!b.accountDocumentId });
    per.set(b.leaseId, row);
    if (!b.accountDocumentId) out.noDocSatang += own;
  }
  if (!per.size) return out;
  const leaseIds = [...per.keys()];
  const roomIds = [...new Set([...per.values()].map((r) => r.roomId))];
  const [leases, rooms] = await Promise.all([
    db.dormLease.findMany({ where: { id: { in: leaseIds } }, select: { id: true, partyId: true } }),
    db.hotelRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true, buildingId: true } }),
  ]);
  const partyOf = new Map(leases.map((l) => [l.id, l.partyId]));
  const roomOf = new Map(rooms.map((r) => [r.id, r]));
  const partyIds = [...new Set(leases.map((l) => l.partyId))];
  const parties = partyIds.length ? await tenantDb({ tenantId: g.tenantId }).party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(parties.map((p) => [p.id, firstName(p.name)]));
  out.rows = leaseIds.map((leaseId) => {
    const r = per.get(leaseId)!;
    const room = roomOf.get(r.roomId);
    const partyId = partyOf.get(leaseId) ?? "";
    return {
      leaseId,
      partyId,
      roomId: r.roomId,
      roomNumber: room?.number ?? "",
      buildingId: room?.buildingId ?? null,
      tenantFirstName: nameOf.get(partyId) ?? null,
      buckets: r.buckets,
      bills: r.bills,
    };
  });
  out.rows.sort((x, y) => roomCmp(x.roomNumber, y.roomNumber));
  return out;
}

// ───────────────────────── อัตราเข้าพัก ─────────────────────────
async function occupancyOf(g: Gate, from: string, to: string): Promise<DormOccupancyReport> {
  const cur = g.today.slice(0, 7);
  const todayDay = Number(g.today.slice(8, 10));
  const months = monthsOf(from, to);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const rooms = g.rooms && g.rooms.size === 0 ? [] : await db.hotelRoom.findMany({ where: { active: true, ...(g.rooms ? { id: { in: [...g.rooms] } } : {}) }, select: { id: true } });
  const roomIds = rooms.map((r) => r.id);
  const leases = roomIds.length
    ? await db.dormLease.findMany({
        where: { status: { in: LEASE_COUNTED }, roomId: { in: roomIds } },
        select: { roomId: true, status: true, startDate: true, endedAt: true, moveOut: { select: { moveOutDate: true, status: true } } },
      })
    : [];
  // ช่วงอยู่ต่อห้อง (วันเข้า–วันออก นับรวมทั้งสองวัน · ยังอยู่ = null) แล้วรวมช่วงที่ทับกัน ⇒ ห้องเดียวกันหลายสัญญาวันเดียวกันนับ 1
  const spans = new Map<string, { s: string; e: string | null }[]>();
  for (const l of leases) {
    const s = ymdOfDb(l.startDate);
    if (!s) continue;
    let e: string | null = null;
    if (l.status === "ENDED") {
      const mo = l.moveOut && l.moveOut.status !== "CANCELLED" ? ymdOfDb(l.moveOut.moveOutDate) : null;
      e = mo ?? (l.endedAt instanceof Date ? bkkYmd(l.endedAt) : null);
      if (!e || e < s) continue;
    }
    const list = spans.get(l.roomId) ?? [];
    list.push({ s, e });
    spans.set(l.roomId, list);
  }
  const merged = new Map<string, { s: string; e: string | null }[]>();
  for (const [roomId, list] of spans) {
    list.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
    const acc: { s: string; e: string | null }[] = [];
    for (const x of list) {
      const last = acc[acc.length - 1];
      if (last && (last.e === null || x.s <= last.e)) {
        if (last.e !== null && (x.e === null || x.e > last.e)) last.e = x.e;
      } else acc.push({ ...x });
    }
    merged.set(roomId, acc);
  }
  let sumOcc = 0;
  let sumDays = 0;
  const out: DormOccupancyMonth[] = months.map((m) => {
    const dim = daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
    const days = m < cur ? dim : m === cur ? todayDay : 0;
    const roomDays = roomIds.length * days;
    let occ = 0;
    if (days > 0) {
      const periodStart = `${m}-01`;
      const periodEnd = `${m}-${String(days).padStart(2, "0")}`;
      for (const list of merged.values()) for (const x of list) occ += occupiedDays({ periodStart, periodEnd, moveIn: x.s, moveOut: x.e });
    }
    sumOcc += occ;
    sumDays += roomDays;
    return { month: m, rooms: roomIds.length, days, roomDays, occupiedRoomDays: occ, rateBp: ratioBp(occ, roomDays) };
  });
  return { months: out, averageBp: ratioBp(sumOcc, sumDays) };
}

// ───────────────────────── รายได้แยกประเภท ─────────────────────────
async function revenueOf(g: Gate, from: string, to: string): Promise<DormRevenueReport> {
  const months = new Map<string, DormRevenueMonth>();
  for (const p of monthsOf(from, to)) months.set(p, { periodKey: p, bills: 0, noDocBills: 0, types: zeroTypes(), total: zero3(), collectedSatang: 0 });
  const grand = { types: zeroTypes(), total: zero3(), collectedSatang: 0 };
  const finish = (): DormRevenueReport => {
    for (const m of months.values()) {
      for (const t of DORM_REVENUE_TYPES) add3(grand.types[t], m.types[t]);
      add3(grand.total, m.total);
      grand.collectedSatang += m.collectedSatang;
    }
    return { months: [...months.values()], grand };
  };
  if (g.rooms && g.rooms.size === 0) return finish();
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const all = await db.dormBill.findMany({
    where: { status: { in: SENTISH }, periodKey: { gte: from, lte: to }, ...(g.rooms ? { roomId: { in: [...g.rooms] } } : {}) },
    select: { id: true, periodKey: true, lines: true, accountDocumentId: true, paidSatang: true },
  });
  // ใบแจ้งหนี้ถูกยกเลิก/ร่าง ⇒ ไม่นับทั้งบิล (§2 ข้อ 7)
  const dead = await dormDocsDead(g.tenantId, all.map((b) => b.accountDocumentId).filter((x): x is string => !!x));
  const bills = all.filter((b) => months.has(b.periodKey) && !(b.accountDocumentId && dead.has(b.accountDocumentId)));
  if (!bills.length) return finish();
  const docBillIds = bills.filter((b) => !!b.accountDocumentId).map((b) => b.id);
  const [paid, adjust] = await Promise.all([
    billPaidSatang(g.tenantId, bills),
    docBillIds.length
      ? db.$queryRaw<{ billId: string; docType: string; subTotal: number; vatAmount: number; grandTotal: number }[]>`
          SELECT split_part("refId", ':', 1) AS "billId", "docType"::text AS "docType", "subTotal", "vatAmount", "grandTotal"
          FROM "AccountDocument"
          WHERE "tenantId" = ${g.tenantId} AND "refType" = ${ADJUST_REF} AND "status"::text <> ALL(${DOC_DEAD}::text[])
            AND split_part("refId", ':', 1) = ANY(${docBillIds}::text[])`
      : Promise.resolve([]),
  ]);
  const periodOfBill = new Map(bills.map((b) => [b.id, b.periodKey]));
  for (const b of bills) {
    const m = months.get(b.periodKey)!;
    m.bills += 1;
    if (!b.accountDocumentId) m.noDocBills += 1;
    const lines = Array.isArray(b.lines) ? b.lines : [];
    for (const l of lines) {
      if (!isRec(l)) continue;
      const v = { netSatang: int(l.netSatang), vatSatang: int(l.vatSatang), grossSatang: int(l.grossSatang) };
      add3(m.types[typeOfCode(l.code)], v);
      add3(m.total, v);
    }
    m.collectedSatang += paid.get(b.id) ?? 0;
  }
  // ADJUST = Σ ใบเพิ่มหนี้ − Σ ใบลดหนี้ที่มีผล ใส่งวดของบิลที่ถูกปรับ (R4 · R8)
  for (const d of adjust) {
    const p = periodOfBill.get(d.billId);
    if (!p) continue;
    const sign = d.docType === "CREDIT_NOTE" ? -1 : d.docType === "DEBIT_NOTE" ? 1 : 0;
    if (!sign) continue;
    const m = months.get(p)!;
    const v = { netSatang: Number(d.subTotal), vatSatang: Number(d.vatAmount), grossSatang: Number(d.grandTotal) };
    add3(m.types.ADJUST, v, sign);
    add3(m.total, v, sign);
  }
  return finish();
}

// ───────────────────────── ทางเข้าสาธารณะ (§3) ─────────────────────────
export async function dormAgingReport(ctx: DormReportCtx, i: { unitId: string }, opts?: { now?: Date }): Promise<({ ok: true } & DormAgingReport) | DormReportFail> {
  const g = await gateOf(ctx, i, nowOf(opts?.now));
  if (!g) return notFound();
  return { ok: true, ...(await agingOf(g)) };
}

export async function dormOccupancyReport(
  ctx: DormReportCtx,
  i: { unitId: string; fromMonth: string; toMonth: string },
  opts?: { now?: Date },
): Promise<({ ok: true } & DormOccupancyReport) | DormReportFail> {
  const g = await gateOf(ctx, i, nowOf(opts?.now));
  if (!g) return notFound();
  const lim = await limitsOf(g);
  if (!lim) return invalid("ค่าตั้งรายงานหอไม่ถูกต้อง");
  const r = checkRange(i.fromMonth, i.toMonth, g.today, lim.maxMonths);
  if ("ok" in r) return r;
  return { ok: true, ...(await occupancyOf(g, r.from, r.to)) };
}

export async function dormRevenueReport(
  ctx: DormReportCtx,
  i: { unitId: string; fromMonth: string; toMonth: string },
  opts?: { now?: Date },
): Promise<({ ok: true } & DormRevenueReport) | DormReportFail> {
  const g = await gateOf(ctx, i, nowOf(opts?.now));
  if (!g) return notFound();
  const lim = await limitsOf(g);
  if (!lim) return invalid("ค่าตั้งรายงานหอไม่ถูกต้อง");
  const r = checkRange(i.fromMonth, i.toMonth, g.today, lim.maxMonths);
  if ("ok" in r) return r;
  return { ok: true, ...(await revenueOf(g, r.from, r.to)) };
}

export async function dormReportModel(
  ctx: DormReportCtx,
  i: { unitId: string; range?: DormReportRange },
  opts?: { now?: Date },
): Promise<({ ok: true } & DormReportModel) | DormReportFail> {
  const g = await gateOf(ctx, i, nowOf(opts?.now));
  if (!g) return notFound();
  const range = i.range === undefined ? "6M" : i.range;
  if (!RANGES.includes(range)) return invalid("ช่วงรายงานต้องเป็น เดือนนี้ · 6 เดือน · ปีนี้");
  const lim = await limitsOf(g);
  if (!lim) return invalid("ค่าตั้งรายงานหอไม่ถูกต้อง");
  const { from, to } = rangeOf(range, g.today, lim.maxMonths);
  const [aging, occupancy, revenue] = await Promise.all([agingOf(g), occupancyOf(g, from, to), revenueOf(g, from, to)]);
  const last = revenue.months[revenue.months.length - 1];
  const od = (b: DormAgingBuckets) => b.d1_30Satang + b.d31_60Satang + b.d61_90Satang + b.d90plusSatang;
  const billed = last?.total.grossSatang ?? 0;
  const collected = last?.collectedSatang ?? 0;
  return {
    ok: true,
    unitId: g.unitId,
    unitName: g.unitName,
    range,
    fromMonth: from,
    toMonth: to,
    asOf: g.today,
    aging,
    occupancy,
    revenue,
    kpi: {
      occupancyAvgBp: occupancy.averageBp,
      occupancyCurrentBp: occupancy.months[occupancy.months.length - 1]?.rateBp ?? 0,
      collected: { periodKey: to, billedGrossSatang: billed, collectedSatang: collected, rateBp: ratioBp(collected, billed) },
      overdue: { satang: od(aging.buckets), rooms: aging.rows.filter((r) => od(r.buckets) > 0).length },
    },
  };
}

const BUCKET_TH: Record<DormAgingBucket, string> = {
  notDue: "ยังไม่ครบกำหนด",
  d1_30: "เลย 1–30 วัน",
  d31_60: "เลย 31–60 วัน",
  d61_90: "เลย 61–90 วัน",
  d90plus: "เกิน 90 วัน",
};
const REVENUE_TH: Record<DormRevenueType, string> = {
  RENT: "ค่าเช่าห้อง",
  COMMON: "ค่าส่วนกลาง",
  ELEC: "ค่าไฟ",
  WATER: "ค่าน้ำ",
  LATE_FEE: "ค่าปรับชำระล่าช้า",
  OTHER: "ค่าบริการอื่น",
  ADJUST: "ปรับยอด (ใบลด/เพิ่มหนี้)",
};

/** ส่งออก CSV (UTF-8 + BOM · ทุกแถวผ่าน csvRow กันสูตร X6) — แถวข้อมูลเกินเพดาน ⇒ TOO_LARGE ไม่มีไฟล์ครึ่ง ๆ */
export async function dormReportCsv(
  ctx: DormReportCtx,
  i: { unitId: string; kind: DormReportCsvKind; fromMonth?: string; toMonth?: string },
  opts?: { now?: Date },
): Promise<{ ok: true; filename: string; csv: string; rows: number } | DormReportFail> {
  const g = await gateOf(ctx, i, nowOf(opts?.now));
  if (!g) return notFound();
  const kind = i.kind;
  if (!CSV_KINDS.includes(kind)) return invalid("ชนิดไฟล์ส่งออกไม่ถูกต้อง");
  const lim = await limitsOf(g);
  if (!lim) return invalid("ค่าตั้งรายงานหอไม่ถูกต้อง");
  const lines: string[] = [];
  let filename = "";
  if (kind === "AGING") {
    const a = await agingOf(g);
    lines.push(csvRow(["ห้อง", "ผู้เช่า", "งวด", "ครบกำหนด", "เลยกำหนด (วัน)", "อายุหนี้", "ค้าง (บาท)"]));
    for (const r of a.rows) for (const b of r.bills) lines.push(csvRow([r.roomNumber, r.tenantFirstName ?? "", b.periodKey, b.dueDate ?? "", b.daysLate, BUCKET_TH[b.bucket], bahtStr(b.outstandingSatang)]));
    filename = `dorm-aging-${g.today}.csv`;
  } else {
    const noRange = (i.fromMonth === undefined || i.fromMonth === null) && (i.toMonth === undefined || i.toMonth === null);
    const r = noRange ? rangeOf("6M", g.today, lim.maxMonths) : checkRange(i.fromMonth, i.toMonth, g.today, lim.maxMonths);
    if ("ok" in r) return r;
    if (kind === "OCCUPANCY") {
      const o = await occupancyOf(g, r.from, r.to);
      lines.push(csvRow(["เดือน", "ห้อง", "วัน", "ห้อง-วัน", "ห้อง-วันที่มีผู้เช่า", "อัตราเข้าพัก (%)"]));
      for (const m of o.months) lines.push(csvRow([m.month, m.rooms, m.days, m.roomDays, m.occupiedRoomDays, pctStr(m.rateBp)]));
      filename = `dorm-occupancy-${r.from}-${r.to}.csv`;
    } else {
      const v = await revenueOf(g, r.from, r.to);
      lines.push(csvRow(["งวด", "ประเภท", "ไม่รวม VAT (บาท)", "VAT (บาท)", "รวม VAT (บาท)"]));
      for (const m of v.months) for (const t of DORM_REVENUE_TYPES) {
        const x = m.types[t];
        lines.push(csvRow([m.periodKey, REVENUE_TH[t], bahtStr(x.netSatang), bahtStr(x.vatSatang), bahtStr(x.grossSatang)]));
      }
      filename = `dorm-revenue-${r.from}-${r.to}.csv`;
    }
  }
  const rows = lines.length - 1;
  if (rows > lim.maxRows) return { ok: false, code: "TOO_LARGE", reason: `ข้อมูล ${rows} แถว เกินเพดานส่งออก ${lim.maxRows} แถวต่อไฟล์ — เลือกช่วงให้สั้นลง` };
  return { ok: true, filename, csv: `${BOM}${lines.join("\r\n")}\r\n`, rows };
}
