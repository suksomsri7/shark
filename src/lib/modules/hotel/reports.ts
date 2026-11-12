// SVC H.7 ▸ รายงานโรงแรม (อ่านอย่างเดียว) — ใบสั่ง ledger/svc-briefs/svc-brief-h.7.md §0 (รายงาน) §2.7–2.8 §3.3 §9.2–9.6 · สเปก S §10
//   • ctx = {tenantId, actorUserId} แบบรายงานหอ (D.19) — ด่าน: Membership สด + หน่วย HOTEL ของร้าน + เข้าหน่วยได้ (ไม่ผ่าน ⇒ NOT_FOUND) + hotel.reports.read (FORBIDDEN)
//   • วันที่ปิดแล้ว (HotelNightAudit CLOSED) = ตัวเลขที่ freeze · วันที่ยังไม่ปิด = คำนวณสด สูตรเดียวกับ KPI (computeKpi) · รายได้ห้องสด = roomRevenueByDay
//     (r3 มติผู้คุม ข้อ 1: ROOM ที่โพสต์แล้วและยังไม่ void + nights.priceSatang ของคืนที่ยังไม่โพสต์ · ไม่นับ folio VOID/การจอง REFUNDED ·
//     คืนค้างของวันที่ปิดแล้วนับเข้าวันที่รอปิด) ⇒ preview = สด = freeze
//   • revenueReport: ห้อง = ROOM · อื่น = ค่าใช้จ่ายอื่นทุกชนิดในบิล (บริการ · มินิบาร์ · ลงห้อง · ค่าปรับ · ส่วนลด · ภาษี/ค่าบริการแยก) ⇒ รวม = ยอดที่เก็บแขก
//     (= ยอดบิลเช็กเอาต์ POS) · vatSatang = ส่วน VAT ของยอดรวมตามโหมดภาษีของบิล ⇒ รวม − VAT = รายได้ GL 4xxx
//   • คืนสภาพมัดจำที่ริบของแขกที่ย้อน «ไม่มา» แล้วเข้าพัก (hook ของการปิดวัน · restoreForfeitedDepositsOnStay — ฟังก์ชันเดียวในไฟล์นี้ที่เขียน)
//   • เงิน = Int สตางค์ · % = bp · ช่วงวัน ≤ 366 วัน (เกิน ⇒ INVALID_RANGE) · ≤ 8 คำสั่ง SQL ต่อรายงาน (คิวรีชุด · join ด้วย SQL เดียว ไม่ N+1)
//   • ไม่มีข้อมูลแขก (ชื่อ/เบอร์/อีเมล) ใน DTO (X10) · CSV ผ่าน csvRow (กันสูตร X6) + BOM · ไม่มี "use server"
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { csvRow } from "@/lib/core/csv";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";
import { hotelAvailability } from "./availability";
import { computeKpi, roomRevenueByDay, type KpiNight, type KpiRoom } from "./night-audit";
import { folioSettings } from "./folio";
import { splitIncludedVat } from "@/lib/money/vat";
import { addDaysYmd, isYmd, roundFraction } from "./pricing";
import { businessDateOf, daysInclusive, normalizeTimezone, ymdOfDate, ymdToDbDate, zonedDayStart } from "./business-date";

// ───────────────────────── ชนิด ─────────────────────────
export type HotelReportCtx = { tenantId: string; actorUserId: string };
export type ReportFailCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID_INPUT" | "INVALID_RANGE";
export type ReportFail = { ok: false; code: ReportFailCode; reason: string };
export type OccupancyRow = { period: string; occupancyBps: number; adrSatang: number; revparSatang: number; occupied: number; available: number; revenueSatang: number; closed: boolean };
export type OccupancyReport = { ok: true; unitId: string; from: string; to: string; groupBy: "day" | "month"; rows: OccupancyRow[]; total: Omit<OccupancyRow, "period" | "closed"> };
export type RevenueGroupBy = "source" | "ratePlan" | "roomType";
export type RevenueRow = { key: string; label: string; roomRevenueSatang: number; otherRevenueSatang: number; totalSatang: number; vatSatang: number };
export type RevenueReport = { ok: true; unitId: string; from: string; to: string; groupBy: RevenueGroupBy; rows: RevenueRow[]; total: Omit<RevenueRow, "key" | "label"> };
export type FunnelRow = {
  source: string;
  label: string;
  created: number;
  confirmed: number;
  cancelled: number;
  noShow: number;
  confirmRateBps: number;
  cancelRateBps: number;
  leadTimeDaysAvg: number;
  alosNights: number;
  cancelReasons: { reason: string; count: number }[];
};
export type FunnelReport = { ok: true; unitId: string; from: string; to: string; rows: FunnelRow[]; leadTimeDaysAvg: number; alosNights: number; created: number; confirmed: number; cancelled: number; noShow: number; confirmRateBps: number; cancelRateBps: number };
export type ForecastRow = { date: string; onBooks: number; available: number; occupancyBps: number };
export type ForecastReport = { ok: true; unitId: string; from: string; rows: ForecastRow[] };
export type HousekeepingReport = { ok: true; unitId: string; from: string; to: string; byDay: { date: string; cleaned: number }[]; byUser: { userId: string; name: string; cleaned: number }[]; oooOutstanding: number };
export type DepositsReport = { ok: true; unitId: string; from: string; to: string; holdActive: number; holdExpired: number; depositPendingSatang: number; forfeitedSatang: number; refundedSatang: number };
export type UnitKpi = { occupancyTodayBps: number; arrivalsToday: number; roomRevenueYesterdaySatang: number };
export type CsvKind = "occupancy" | "revenue" | "funnel" | "forecast" | "housekeeping" | "housekeepingUsers" | "deposits" | "history";

export const REPORT_MAX_DAYS = 366;
export const SOURCE_TH: Record<string, string> = { WEB: "เว็บไซต์", WALK_IN: "วอล์กอิน", PHONE: "โทรศัพท์", LINE: "ไลน์ (LINE)", OTA: "OTA" };
const OCCUPYING = ["CHECKED_IN", "CHECKED_OUT"];
const CONFIRMED_LIKE = new Set(["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW", "BOOKED", "REFUNDED"]);
const R = {
  notFound: "ไม่พบโรงแรมนี้ หรือบัญชีนี้เข้าถึงหน่วยนี้ไม่ได้",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์ดูรายงานโรงแรม",
  badDate: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และวันเริ่มต้องไม่หลังวันสุดท้าย",
  range: `เลือกช่วงได้ไม่เกิน ${REPORT_MAX_DAYS} วัน`,
  groupBy: "รูปแบบการจัดกลุ่มไม่ถูกต้อง",
} as const;

const fail = (code: ReportFailCode, reason: string): ReportFail => ({ ok: false, code, reason });
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isReportFail = (v: unknown): v is ReportFail => isRec(v) && v.ok === false && typeof v.code === "string";
const bps = (num: number, den: number) => (den > 0 ? Math.floor((num * 10_000) / den) : 0);
const n = (v: unknown): number => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : Number(v ?? 0) || 0);

// ───────────────────────── ด่าน ─────────────────────────
/** client ของร้าน (tenantDb · ไม่มี raw prisma ในโมดูล — fitness F5.1 · SQL ดิบใส่ tenantId/unitId เองทุกคำสั่ง) */
const dbOf = (tenantId: string, unitId?: string) => tenantDb({ tenantId, ...(unitId ? { unitId } : {}) });
type Tx = Prisma.TransactionClient;
/** client ของร้านในรูป TransactionClient (สำหรับฟังก์ชันร่วมของ night-audit ที่รับได้ทั้ง tx และ client ปกติ) */
const txOf = (g: { tenantId: string; unitId: string }): Tx => tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;
type Gate = { tenantId: string; unitId: string; tz: string; today: string };
type GateRow = { unitId: string; settings: unknown; role: string | null; unitAccess: unknown; permissions: unknown };

/** ด่านเดียว (1 คำสั่ง SQL): หน่วย HOTEL ของร้าน + Membership สดของผู้ดู — ไม่ผ่าน ⇒ NOT_FOUND · ไม่มีสิทธิ์ ⇒ FORBIDDEN */
async function gateOf(ctx: unknown, input: unknown): Promise<Gate | ReportFail> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isRec(input) || !isStr(input.unitId) || input.unitId.length > 64) return fail("NOT_FOUND", R.notFound);
  const tenantId = ctx.tenantId;
  const rows = await dbOf(tenantId).$queryRaw<GateRow[]>`
    SELECT u.id AS "unitId", u.settings AS settings, m.role::text AS role, m."unitAccess" AS "unitAccess", m.permissions AS permissions
      FROM "BusinessUnit" u
      LEFT JOIN "Membership" m ON m."tenantId" = u."tenantId" AND m."userId" = ${ctx.actorUserId} AND m."acceptedAt" IS NOT NULL
     WHERE u.id = ${input.unitId} AND u."tenantId" = ${tenantId} AND u.type::text = 'HOTEL'
     LIMIT 1`;
  const r = rows[0];
  if (!r || !r.role) return fail("NOT_FOUND", R.notFound);
  const m: MembershipCtx = {
    role: r.role as MembershipCtx["role"],
    unitAccess: Array.isArray(r.unitAccess) ? r.unitAccess.filter(isStr) : [],
    permissions: isRec(r.permissions) ? r.permissions : {},
  };
  if (!canAccessUnit(m, r.unitId)) return fail("NOT_FOUND", R.notFound);
  if (!evaluate(m, { module: "hotel", action: "hotel.reports.read", unitId: r.unitId })) return fail("FORBIDDEN", R.forbidden);
  const tz = normalizeTimezone(isRec(r.settings) ? r.settings.timezone : null);
  return { tenantId, unitId: r.unitId, tz, today: businessDateOf(tz, new Date()) };
}

/** ช่วงวัน (รวมหัวท้าย) · ไม่ส่ง = 30 วันล่าสุดถึงวันนี้ · ผิดรูป/กลับด้าน ⇒ INVALID_INPUT · เกิน 366 วัน ⇒ INVALID_RANGE */
function rangeOf(g: Gate, input: Record<string, unknown>): { from: string; to: string } | ReportFail {
  const from = input.from === undefined || input.from === null || input.from === "" ? addDaysYmd(g.today, -29) : input.from;
  const to = input.to === undefined || input.to === null || input.to === "" ? g.today : input.to;
  if (!isYmd(from) || !isYmd(to) || from > to) return fail("INVALID_INPUT", R.badDate);
  if (daysInclusive(from, to) > REPORT_MAX_DAYS) return fail("INVALID_RANGE", R.range);
  return { from, to };
}
function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}
async function roundingOf(g: Gate): Promise<string> {
  const r = await resolveSettings({ tenantId: g.tenantId }, ["rooms.money.rounding"], { unitId: g.unitId });
  const v = r["rooms.money.rounding"]?.value;
  return typeof v === "string" ? v : "SATANG";
}

// ───────────────────────── ข้อมูลชุด (ห้อง · BLOCK · คืน) ─────────────────────────
type RoomRow = { id: string; active: boolean; rentMode: string | null; typeRentMode: string };
type NightRow = { id: string; roomId: string | null; d: string; priceSatang: number; status: string; checkIn: string };
async function roomsOf(g: Gate): Promise<KpiRoom[]> {
  const rows = await dbOf(g.tenantId).$queryRaw<RoomRow[]>`
    SELECT r.id, r.active, r."rentMode"::text AS "rentMode", t."rentMode"::text AS "typeRentMode"
      FROM "HotelRoom" r JOIN "HotelRoomType" t ON t.id = r."roomTypeId"
     WHERE r."tenantId" = ${g.tenantId} AND r."unitId" = ${g.unitId} AND r.active = true`;
  return rows.map((r) => ({ id: r.id, active: r.active, rentMode: r.rentMode, typeRentMode: r.typeRentMode }));
}
async function blocksOf(g: Gate, from: string, to: string): Promise<{ roomId: string; s: string; e: string }[]> {
  const rows = await dbOf(g.tenantId, g.unitId).roomOccupancy.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId, kind: "BLOCK", active: true, startDate: { lte: ymdToDbDate(to) }, endDate: { gt: ymdToDbDate(from) } },
    select: { roomId: true, startDate: true, endDate: true },
  });
  return rows.map((b) => ({ roomId: b.roomId, s: ymdOfDate(b.startDate), e: ymdOfDate(b.endDate) }));
}
/** คืน counted ในช่วง + สถานะการจอง (SQL เดียว) · statuses = สถานะที่นับ */
async function nightsOf(g: Gate, from: string, to: string, statuses: string[]): Promise<NightRow[]> {
  const rows = await dbOf(g.tenantId).$queryRaw<NightRow[]>`
    SELECT n.id, n."roomId", to_char(n.date, 'YYYY-MM-DD') AS d, n."priceSatang", r.status::text AS status, to_char(r."checkInDate", 'YYYY-MM-DD') AS "checkIn"
      FROM "HotelBookingNight" n JOIN "HotelReservation" r ON r.id = n."reservationId"
     WHERE n."tenantId" = ${g.tenantId} AND n."unitId" = ${g.unitId} AND n.counted = true
       AND n.date >= ${from}::date AND n.date <= ${to}::date AND r.status::text = ANY(${statuses}::text[])`;
  return rows.map((r) => ({ ...r, priceSatang: n(r.priceSatang) }));
}
const blockedOn = (blocks: { roomId: string; s: string; e: string }[], d: string) => blocks.filter((b) => b.s <= d && b.e > d).map((b) => b.roomId);

// ───────────────────────── occupancyReport ─────────────────────────
/** อัตราเข้าพัก/ADR/RevPAR รายวันหรือรายเดือน · วันปิดแล้ว = ค่าที่ freeze · วันยังไม่ปิด = สด (มติ §9.4) */
export async function occupancyReport(ctx: unknown, input: unknown): Promise<OccupancyReport | ReportFail> {
  const g = await gateOf(ctx, input);
  if (isReportFail(g)) return g;
  const i = isRec(input) ? input : {};
  const groupBy = i.groupBy === undefined || i.groupBy === null || i.groupBy === "" ? "day" : i.groupBy;
  if (groupBy !== "day" && groupBy !== "month") return fail("INVALID_INPUT", R.groupBy);
  const r = rangeOf(g, i);
  if (isReportFail(r)) return r;
  const [rooms, blocks, audits, nights, revByDay, rounding] = await Promise.all([
    roomsOf(g),
    blocksOf(g, r.from, r.to),
    dbOf(g.tenantId, g.unitId).hotelNightAudit.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId, status: "CLOSED", businessDate: { gte: ymdToDbDate(r.from), lte: ymdToDbDate(r.to) } },
      select: { businessDate: true, occupancyBps: true, adrSatang: true, revparSatang: true, roomsOccupied: true, roomsAvailable: true, roomRevenueSatang: true },
    }),
    nightsOf(g, r.from, r.to, OCCUPYING),
    roomRevenueByDay(txOf(g), g, r.from, r.to),
    roundingOf(g),
  ]);
  const auditOf = new Map(audits.map((a) => [ymdOfDate(a.businessDate), a]));
  const nightsByDay = new Map<string, NightRow[]>();
  for (const x of nights) (nightsByDay.get(x.d) ?? nightsByDay.set(x.d, []).get(x.d) ?? []).push(x);
  const days: OccupancyRow[] = daysOf(r.from, r.to).map((d) => {
    const a = auditOf.get(d);
    if (a) return { period: d, occupancyBps: a.occupancyBps, adrSatang: a.adrSatang, revparSatang: a.revparSatang, occupied: a.roomsOccupied, available: a.roomsAvailable, revenueSatang: a.roomRevenueSatang, closed: true };
    const ns = nightsByDay.get(d) ?? [];
    const k = computeKpi({ rooms, blockedRoomIds: blockedOn(blocks, d), nights: ns.map((x): KpiNight => ({ id: x.id, roomId: x.roomId, status: x.status })), roomRevenueSatang: revByDay.get(d) ?? 0, rounding });
    return { period: d, occupancyBps: k.occupancyBps, adrSatang: k.adrSatang, revparSatang: k.revparSatang, occupied: k.roomsOccupied, available: k.roomsAvailable, revenueSatang: k.roomRevenueSatang, closed: false };
  });
  const agg = (period: string, xs: OccupancyRow[]): OccupancyRow => {
    const occ = xs.reduce((s, x) => s + x.occupied, 0);
    const av = xs.reduce((s, x) => s + x.available, 0);
    const rev = xs.reduce((s, x) => s + x.revenueSatang, 0);
    return { period, occupied: occ, available: av, revenueSatang: rev, occupancyBps: bps(occ, av), adrSatang: occ > 0 ? roundFraction(rev, occ, rounding) : 0, revparSatang: av > 0 ? roundFraction(rev, av, rounding) : 0, closed: xs.every((x) => x.closed) };
  };
  let rows = days;
  if (groupBy === "month") {
    const byM = new Map<string, OccupancyRow[]>();
    for (const x of days) (byM.get(x.period.slice(0, 7)) ?? byM.set(x.period.slice(0, 7), []).get(x.period.slice(0, 7)) ?? []).push(x);
    rows = [...byM.entries()].map(([m, xs]) => agg(m, xs));
  }
  const t = agg("total", days);
  return { ok: true, unitId: g.unitId, from: r.from, to: r.to, groupBy, rows, total: { occupancyBps: t.occupancyBps, adrSatang: t.adrSatang, revparSatang: t.revparSatang, occupied: t.occupied, available: t.available, revenueSatang: t.revenueSatang } };
}

// ───────────────────────── revenueReport ─────────────────────────
type ItemRow = { folioId: string; type: string; amountSatang: unknown; source: string; planCode: string | null; planName: string | null; typeId: string | null; typeName: string | null };
/** ชนิดแถว folio ที่เป็นยอดที่เก็บแขก (ค่าใช้จ่าย + ภาษี/ค่าบริการแยก) — ไม่ใช่: มัดจำ/รับเงิน/คืนเงิน/เงินประกัน/ตัวกลับรายการ (void ดูจาก voidedAt) */
const BILLED_TYPES = ["ROOM", "SERVICE", "POS_CHARGE", "MINIBAR", "PENALTY", "DISCOUNT", "TAX", "SERVICE_CHARGE"] as const;
/**
 * รายได้ตามแหล่งจอง/แผนราคา/ประเภทห้อง (มติผู้คุม r3 ข้อ 1 · SQL เดียว) — แถวที่ยังไม่ void ตาม businessDate · ไม่นับ folio VOID / การจอง REFUNDED:
 *   ห้อง = Σ ROOM (ราคาที่ขายแขก) · อื่น = Σ ค่าใช้จ่ายอื่นในบิล (บริการ · มินิบาร์ · ลงห้อง · ค่าปรับ · ส่วนลด · ภาษี/ค่าบริการแยกของโหมด EXCLUSIVE) ⇒ รวม = ยอดที่เก็บแขก (= ยอดบิลเช็กเอาต์ POS)
 *   vatSatang = ส่วน VAT ของยอดรวมตามโหมดภาษีของบิล ต่อ folio (INCLUSIVE: ถอด VAT จากยอดรวม · EXCLUSIVE: แถว TAX + VAT ในบิลร้านที่ลงห้อง) ⇒ รวม − VAT = รายได้ GL 4xxx
 *   groupBy roomType ใช้ id ประเภทห้องเป็นคีย์ (ชื่อซ้ำไม่รวมกัน) · ชื่อเป็นป้าย
 */
export async function revenueReport(ctx: unknown, input: unknown): Promise<RevenueReport | ReportFail> {
  const g = await gateOf(ctx, input);
  if (isReportFail(g)) return g;
  const i = isRec(input) ? input : {};
  const groupBy = i.groupBy === undefined || i.groupBy === null || i.groupBy === "" ? "source" : i.groupBy;
  if (groupBy !== "source" && groupBy !== "ratePlan" && groupBy !== "roomType") return fail("INVALID_INPUT", R.groupBy);
  const r = rangeOf(g, i);
  if (isReportFail(r)) return r;
  const types = [...BILLED_TYPES];
  const [items, st] = await Promise.all([
    dbOf(g.tenantId).$queryRaw<ItemRow[]>`
      SELECT i."folioId", i.type, i."amountSatang", rv.source::text AS source,
             p.code AS "planCode", p.name AS "planName", t.id AS "typeId", t.name AS "typeName"
        FROM "HotelFolioItem" i
        JOIN "HotelFolio" f ON f.id = i."folioId"
        JOIN "HotelReservation" rv ON rv.id = f."reservationId"
        LEFT JOIN "HotelBookingNight" bn ON i."refType" = 'HotelBookingNight' AND bn.id = i."refId"
        LEFT JOIN "HotelRatePlan" p ON p.id = COALESCE(bn."ratePlanId", rv."ratePlanId")
        LEFT JOIN "HotelRoomType" t ON t.id = COALESCE(bn."roomTypeId", rv."roomTypeId")
       WHERE i."tenantId" = ${g.tenantId} AND i."unitId" = ${g.unitId} AND i."voidedAt" IS NULL
         AND f.status <> 'VOID' AND rv.status::text <> 'REFUNDED'
         AND i.type = ANY(${types}::text[])
         AND i."businessDate" >= ${r.from}::date AND i."businessDate" <= ${r.to}::date`,
    folioSettings(g.tenantId, g.unitId),
  ]);
  const vatOf = (billed: number, tax: number, posPart: number): number => (st.mode === "EXCLUSIVE" ? tax + splitIncludedVat(posPart, st.vatBp).vatSatang : splitIncludedVat(billed, st.vatBp).vatSatang);
  type Part = { billed: number; tax: number; pos: number };
  const add = (m: Map<string, Part>, k: string, it: ItemRow, amt: number) => {
    const p = m.get(k) ?? { billed: 0, tax: 0, pos: 0 };
    p.billed += amt;
    if (it.type === "TAX") p.tax += amt;
    if (it.type === "POS_CHARGE") p.pos += amt;
    m.set(k, p);
  };
  const groups = new Map<string, RevenueRow>();
  const perRowFolio = new Map<string, Map<string, Part>>();
  const perFolio = new Map<string, Part>();
  for (const it of items) {
    const [key, label] =
      groupBy === "source"
        ? [it.source, SOURCE_TH[it.source] ?? it.source]
        : groupBy === "ratePlan"
          ? [it.planCode ?? "NONE", it.planName ?? "ไม่มีแผนราคา"]
          : [it.typeId ?? "NONE", it.typeName ?? "ไม่ระบุประเภท"];
    const row = groups.get(key) ?? { key, label, roomRevenueSatang: 0, otherRevenueSatang: 0, totalSatang: 0, vatSatang: 0 };
    const amt = n(it.amountSatang);
    if (it.type === "ROOM") row.roomRevenueSatang += amt;
    else row.otherRevenueSatang += amt;
    row.totalSatang = row.roomRevenueSatang + row.otherRevenueSatang;
    groups.set(key, row);
    add(perRowFolio.get(key) ?? perRowFolio.set(key, new Map()).get(key) ?? new Map(), it.folioId, it, amt);
    add(perFolio, it.folioId, it, amt);
  }
  for (const [key, row] of groups) row.vatSatang = [...(perRowFolio.get(key)?.values() ?? [])].reduce((s, p) => s + vatOf(p.billed, p.tax, p.pos), 0);
  const rows = [...groups.values()].sort((a, b) => b.totalSatang - a.totalSatang || a.key.localeCompare(b.key));
  const room = rows.reduce((s, x) => s + x.roomRevenueSatang, 0);
  const other = rows.reduce((s, x) => s + x.otherRevenueSatang, 0);
  const vat = [...perFolio.values()].reduce((s, p) => s + vatOf(p.billed, p.tax, p.pos), 0);
  return { ok: true, unitId: g.unitId, from: r.from, to: r.to, groupBy, rows, total: { roomRevenueSatang: room, otherRevenueSatang: other, totalSatang: room + other, vatSatang: vat } };
}

// ───────────────────────── bookingFunnel ─────────────────────────
/** ฟันเนลการจองต่อแหล่ง (จองที่สร้างในช่วง · วันของร้าน): สร้าง · ยืนยัน · ยกเลิก(เหตุผล) · ไม่มา · lead time · ALOS */
export async function bookingFunnel(ctx: unknown, input: unknown): Promise<FunnelReport | ReportFail> {
  const g = await gateOf(ctx, input);
  if (isReportFail(g)) return g;
  const r = rangeOf(g, isRec(input) ? input : {});
  if (isReportFail(r)) return r;
  const rvs = await dbOf(g.tenantId, g.unitId).hotelReservation.findMany({
    where: { tenantId: g.tenantId, unitId: g.unitId, createdAt: { gte: zonedDayStart(g.tz, r.from), lt: zonedDayStart(g.tz, addDaysYmd(r.to, 1)) } },
    select: { source: true, status: true, nights: true, checkInDate: true, createdAt: true, cancelReason: true },
  });
  type Acc = { created: number; confirmed: number; cancelled: number; noShow: number; lead: number; nights: number; reasons: Map<string, number> };
  const by = new Map<string, Acc>();
  const all: Acc = { created: 0, confirmed: 0, cancelled: 0, noShow: 0, lead: 0, nights: 0, reasons: new Map() };
  for (const x of rvs) {
    const a = by.get(x.source) ?? { created: 0, confirmed: 0, cancelled: 0, noShow: 0, lead: 0, nights: 0, reasons: new Map<string, number>() };
    const leadDays = Math.max(0, Math.round((Date.parse(`${ymdOfDate(x.checkInDate)}T00:00:00Z`) - Date.parse(`${businessDateOf(g.tz, x.createdAt)}T00:00:00Z`)) / 86_400_000));
    for (const t of [a, all]) {
      t.created++;
      if (CONFIRMED_LIKE.has(x.status)) t.confirmed++;
      if (x.status === "CANCELLED") {
        t.cancelled++;
        const why = (x.cancelReason ?? "").trim().slice(0, 120) || "ไม่ระบุเหตุผล";
        t.reasons.set(why, (t.reasons.get(why) ?? 0) + 1);
      }
      if (x.status === "NO_SHOW") t.noShow++;
      t.lead += leadDays;
      t.nights += Math.max(0, x.nights);
    }
    by.set(x.source, a);
  }
  const avg1 = (sum: number, cnt: number) => (cnt > 0 ? Math.round((sum * 10) / cnt) / 10 : 0);
  const rows: FunnelRow[] = [...by.entries()]
    .map(([source, a]) => ({
      source,
      label: SOURCE_TH[source] ?? source,
      created: a.created,
      confirmed: a.confirmed,
      cancelled: a.cancelled,
      noShow: a.noShow,
      confirmRateBps: bps(a.confirmed, a.created),
      cancelRateBps: bps(a.cancelled, a.created),
      leadTimeDaysAvg: avg1(a.lead, a.created),
      alosNights: avg1(a.nights, a.created),
      cancelReasons: [...a.reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((p, q) => q.count - p.count),
    }))
    .sort((p, q) => q.created - p.created || p.source.localeCompare(q.source));
  return {
    ok: true,
    unitId: g.unitId,
    from: r.from,
    to: r.to,
    rows,
    created: all.created,
    confirmed: all.confirmed,
    cancelled: all.cancelled,
    noShow: all.noShow,
    confirmRateBps: bps(all.confirmed, all.created),
    cancelRateBps: bps(all.cancelled, all.created),
    leadTimeDaysAvg: avg1(all.lead, all.created),
    alosNights: avg1(all.nights, all.created),
  };
}

// ───────────────────────── forecast30 ─────────────────────────
/** on-the-books 30 วันจากวันนี้ของร้าน — สูตรห้องว่างเดียวของระบบ (hotelAvailability · H.3) */
export async function forecast30(ctx: unknown, input: unknown): Promise<ForecastReport | ReportFail> {
  const g = await gateOf(ctx, input);
  if (isReportFail(g)) return g;
  const av = await hotelAvailability.get({ tenantId: g.tenantId }, { unitId: g.unitId, from: g.today, to: addDaysYmd(g.today, 30) });
  if (!av.ok) return fail("NOT_FOUND", R.notFound);
  const rows: ForecastRow[] = daysOf(g.today, addDaysYmd(g.today, 29)).map((d) => {
    const cells = Object.values(av.byDate[d] ?? {});
    const onBooks = cells.reduce((s, c) => s + c.counted, 0);
    const sell = cells.reduce((s, c) => s + (c.total - c.blocked - c.leased), 0);
    return { date: d, onBooks, available: sell, occupancyBps: bps(onBooks, sell) };
  });
  return { ok: true, unitId: g.unitId, from: g.today, rows };
}

// ───────────────────────── housekeepingReport ─────────────────────────
/** ห้องที่ทำเสร็จ (log →CLEAN) ต่อวัน/ต่อคน + ห้องปิดซ่อมค้าง */
export async function housekeepingReport(ctx: unknown, input: unknown): Promise<HousekeepingReport | ReportFail> {
  const g = await gateOf(ctx, input);
  if (isReportFail(g)) return g;
  const r = rangeOf(g, isRec(input) ? input : {});
  if (isReportFail(r)) return r;
  const today = ymdToDbDate(g.today);
  const [logs, blocked, oooRooms] = await Promise.all([
    dbOf(g.tenantId, g.unitId).hotelHousekeepingLog.findMany({
      where: { tenantId: g.tenantId, unitId: g.unitId, toStatus: "CLEAN", createdAt: { gte: zonedDayStart(g.tz, r.from), lt: zonedDayStart(g.tz, addDaysYmd(r.to, 1)) } },
      select: { byUserId: true, createdAt: true },
    }),
    dbOf(g.tenantId, g.unitId).roomOccupancy.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, kind: "BLOCK", active: true, startDate: { lte: today }, endDate: { gt: today } }, select: { roomId: true } }),
    dbOf(g.tenantId, g.unitId).hotelRoom.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, active: true, hkStatus: "OUT_OF_ORDER" }, select: { id: true } }),
  ]);
  const byDay = new Map<string, number>();
  const byUser = new Map<string, number>();
  for (const l of logs) {
    const d = businessDateOf(g.tz, l.createdAt);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
    const u = l.byUserId ?? "";
    byUser.set(u, (byUser.get(u) ?? 0) + 1);
  }
  const ids = [...byUser.keys()].filter(Boolean);
  const users = ids.length ? await dbOf(g.tenantId).user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? ""]));
  return {
    ok: true,
    unitId: g.unitId,
    from: r.from,
    to: r.to,
    byDay: daysOf(r.from, r.to).map((d) => ({ date: d, cleaned: byDay.get(d) ?? 0 })),
    byUser: [...byUser.entries()].map(([userId, cleaned]) => ({ userId, name: userId ? nameOf.get(userId) || "พนักงาน" : "ระบบ", cleaned })).sort((a, b) => b.cleaned - a.cleaned),
    oooOutstanding: new Set([...blocked.map((b) => b.roomId), ...oooRooms.map((x) => x.id)]).size,
  };
}

// ───────────────────────── depositsReport ─────────────────────────
/**
 * มัดจำ: HOLD ที่ยังถือห้อง · มัดจำค้างรับ (ยืนยันแล้วยังไม่จ่าย) · ริบ (บิลริบผ่าน POS ในช่วง) · คืน (คืนมัดจำการจองในช่วง)
 * r3 (มติผู้คุม ข้อ 4 · G-4): «ริบ» = เฉพาะริบ **มัดจำการจอง** ของการจองที่ยังเป็น «ไม่มา» — แยกจากริบเงินประกันห้อง (ใบรับ securityDepositSaleId)
 * และค่าธรรมเนียมยกเลิก (การจอง CANCELLED) ที่ใช้คีย์ dep-forfeit: เดียวกัน · บิลริบที่ถูกยกเลิก (แขกย้อน «ไม่มา» แล้วเข้าพัก) ไม่ PAID ⇒ ไม่นับ
 */
export async function depositsReport(ctx: unknown, input: unknown): Promise<DepositsReport | ReportFail> {
  const g = await gateOf(ctx, input);
  if (isReportFail(g)) return g;
  const r = rangeOf(g, isRec(input) ? input : {});
  if (isReportFail(r)) return r;
  const now = new Date();
  const start = zonedDayStart(g.tz, r.from);
  const end = zonedDayStart(g.tz, addDaysYmd(r.to, 1));
  const [holds, pending, money] = await Promise.all([
    dbOf(g.tenantId, g.unitId).hotelReservation.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, status: "HOLD" }, select: { holdExpiresAt: true } }),
    dbOf(g.tenantId, g.unitId).hotelReservation.aggregate({ where: { tenantId: g.tenantId, unitId: g.unitId, status: "CONFIRMED", depositPaidAt: null, depositSatang: { gt: 0 } }, _sum: { depositSatang: true } }),
    dbOf(g.tenantId).$queryRaw<{ forfeited: unknown; refunded: unknown }[]>`
      SELECT
        (SELECT COALESCE(SUM(s."grandTotalSatang"), 0) FROM "PosSale" s
           JOIN "HotelReservation" r ON r.id = s."sourceId" AND r."tenantId" = s."tenantId"
           JOIN "PosDeposit" d ON d."tenantId" = s."tenantId" AND (s."idempotencyKey" = 'dep-forfeit:' || d.id OR s."idempotencyKey" LIKE 'dep-forfeit:' || d.id || '-r%')
          WHERE s."tenantId" = ${g.tenantId} AND s."sourceModule" = 'HOTEL' AND s.status::text = 'PAID' AND s."idempotencyKey" LIKE 'dep-forfeit:%'
            AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
            AND r."unitId" = ${g.unitId} AND r.status::text = 'NO_SHOW'
            AND EXISTS (SELECT 1 FROM "HotelReservation" h WHERE h."tenantId" = ${g.tenantId} AND h."unitId" = ${g.unitId} AND h."depositSaleId" = d."receiptSaleId")) AS forfeited,
        (SELECT COALESCE(SUM(x.satang), 0) FROM "PosDepositTxn" x JOIN "PosDeposit" d ON d.id = x."depositId"
          WHERE x."tenantId" = ${g.tenantId} AND x.type::text = 'REFUND' AND x."createdAt" >= ${start} AND x."createdAt" < ${end}
            AND d."receiptSaleId" IN (SELECT "depositSaleId" FROM "HotelReservation" WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "depositSaleId" IS NOT NULL)) AS refunded`,
  ]);
  return {
    ok: true,
    unitId: g.unitId,
    from: r.from,
    to: r.to,
    holdActive: holds.filter((h) => h.holdExpiresAt === null || h.holdExpiresAt > now).length,
    holdExpired: holds.filter((h) => h.holdExpiresAt !== null && h.holdExpiresAt <= now).length,
    depositPendingSatang: pending._sum.depositSatang ?? 0,
    forfeitedSatang: n(money[0]?.forfeited),
    refundedSatang: n(money[0]?.refunded),
  };
}

// ───────────────────────── getUnitKpi (Overview "ทุกกิจการ") ─────────────────────────
/** KPI ย่อของหน่วยโรงแรม: อัตราเข้าพักวันนี้ (on-the-books · มติ §9.6) · เข้าพักวันนี้ · รายได้ห้องเมื่อวาน (ปิดแล้ว = audit · ไม่งั้นสด) — ไม่ใช่โรงแรม/ไม่พบ ⇒ null */
export async function getUnitKpi(unitId: unknown): Promise<UnitKpi | null> {
  if (!isStr(unitId) || unitId.length > 64) return null;
  // Overview เรียกด้วย id หน่วยล้วน (ผู้เรียกผ่านด่านร้านแล้ว) — หาร้านของหน่วยด้วย SQL ดิบ 1 คำสั่ง แล้วอ่านต่อผ่าน tenantDb ของร้านนั้น
  const found = await tenantDb({ tenantId: "hotel-unit-kpi" }).$queryRaw<{ id: string; tenantId: string; settings: unknown }[]>`
    SELECT "id", "tenantId", "settings" FROM "BusinessUnit" WHERE "id" = ${unitId} AND "type"::text = 'HOTEL' LIMIT 1`;
  const u = found[0];
  if (!u) return null;
  const tz = normalizeTimezone(isRec(u.settings) ? u.settings.timezone : null);
  const today = businessDateOf(tz, new Date());
  const yesterday = addDaysYmd(today, -1);
  const g: Gate = { tenantId: u.tenantId, unitId: u.id, tz, today };
  const [rooms, blocks, tonight, arrivals, audit, liveY] = await Promise.all([
    roomsOf(g),
    blocksOf(g, today, today),
    nightsOf(g, today, today, ["CHECKED_IN", "CONFIRMED"]),
    dbOf(g.tenantId, g.unitId).hotelReservation.count({ where: { tenantId: g.tenantId, unitId: g.unitId, checkInDate: ymdToDbDate(today), status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } } }),
    dbOf(g.tenantId, g.unitId).hotelNightAudit.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, businessDate: ymdToDbDate(yesterday), status: "CLOSED" }, select: { roomRevenueSatang: true } }),
    roomRevenueByDay(txOf(g), g, yesterday, yesterday),
  ]);
  const onBooks = tonight.filter((x) => x.status === "CHECKED_IN" || (x.status === "CONFIRMED" && x.checkIn === today));
  const k = computeKpi({ rooms, blockedRoomIds: blockedOn(blocks, today), nights: onBooks.map((x) => ({ id: x.id, roomId: x.roomId, status: "CHECKED_IN" })), roomRevenueSatang: 0 });
  // on-the-books ที่ยังไม่จัดห้อง (CONFIRMED ไม่มี roomId) ก็นับ — ไม่เกินห้องที่ขายได้คืนนี้
  const unassigned = onBooks.filter((x) => x.roomId === null).length;
  const occupied = Math.min(k.roomsAvailable, k.roomsOccupied + unassigned);
  return {
    occupancyTodayBps: bps(occupied, k.roomsAvailable),
    arrivalsToday: arrivals,
    roomRevenueYesterdaySatang: audit ? audit.roomRevenueSatang : (liveY.get(yesterday) ?? 0),
  };
}

// ───────────────────────── คืนสภาพมัดจำที่ริบ (hook ของการปิดวัน · มติผู้คุม r3 ข้อ 3) ─────────────────────────
/**
 * แขกที่ผู้จัดการย้อน «ไม่มา» (AuditLog hotel.booking.no_show_undo) แล้วเข้าพักจริง (CHECKED_IN) แต่บิลริบ **มัดจำการจอง** (dep-forfeit:<มัดจำ> · HOTEL)
 * ยัง PAID ⇒ ยกเลิกบิลริบด้วย voidSale ของ POS (ทางเดียวกับ refundStay · กลับบัญชี) แล้วคืนสภาพมัดจำ (depositSaleVoided · คีย์ dep-restore-<apply>)
 * ⇒ มัดจำกลับเป็น OPEN และถูกใช้หักบิลเช็กเอาต์ (แขกจ่าย = ค่าห้องที่พักจริง · ไม่จ่ายซ้ำ) · depositsReport ไม่นับ (บิลไม่ PAID)
 * ไม่แตะ booking.ts/checkout.ts/folio.ts · idempotent (บิลที่ VOIDED แล้วไม่ถูกหยิบซ้ำ) · ไม่ throw — ล้มต่อใบ = warning (ให้ยกเลิกบิลที่หน้าขาย)
 * ไม่รวมริบเงินประกันห้อง (ใบรับ securityDepositSaleId) และค่าธรรมเนียมยกเลิก (การจอง CANCELLED เข้าพักไม่ได้)
 */
export async function restoreForfeitedDepositsOnStay(c: { tenantId: string; unitId: string }, actorUserId: string | null): Promise<{ restored: number; warnings: string[] }> {
  const warnings: string[] = [];
  const bills = await dbOf(c.tenantId).$queryRaw<{ saleId: string; saleUnitId: string; code: string; receiptNo: string | null; reservationId: string }[]>`
    SELECT s.id AS "saleId", s."unitId" AS "saleUnitId", r.code, s."receiptNo", r.id AS "reservationId"
      FROM "PosSale" s
      JOIN "HotelReservation" r ON r.id = s."sourceId" AND r."tenantId" = s."tenantId"
      JOIN "PosDeposit" d ON d."tenantId" = s."tenantId" AND (s."idempotencyKey" = 'dep-forfeit:' || d.id OR s."idempotencyKey" LIKE 'dep-forfeit:' || d.id || '-r%')
     WHERE s."tenantId" = ${c.tenantId} AND s."sourceModule" = 'HOTEL' AND s.status::text = 'PAID' AND s."docType"::text = 'SALE' AND s."idempotencyKey" LIKE 'dep-forfeit:%'
       AND r."unitId" = ${c.unitId} AND r.status::text = 'CHECKED_IN'
       AND EXISTS (SELECT 1 FROM "HotelReservation" h WHERE h."tenantId" = ${c.tenantId} AND h."unitId" = ${c.unitId} AND h."depositSaleId" = d."receiptSaleId")
       AND EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."tenantId" = ${c.tenantId} AND a.action = 'hotel.booking.no_show_undo' AND a."targetType" = 'HotelReservation' AND a."targetId" = r.id)
     ORDER BY s."createdAt" ASC LIMIT 50`;
  if (!bills.length) return { restored: 0, warnings };
  const pos = await import("@/lib/modules/pos/service");
  const dep = await import("@/lib/modules/pos/deposit");
  let restored = 0;
  for (const b of bills) {
    try {
      await pos.voidSale(c.tenantId, b.saleUnitId, b.saleId, { actorUserId: actorUserId ?? "module:hotel", reason: `แขกเข้าพักหลังย้อน «ไม่มา» (${b.code}) — คืนมัดจำเป็นเครดิตค่าห้อง` });
      await dep.depositSaleVoided({ tenantId: c.tenantId, payload: { saleId: b.saleId } });
      await dbOf(c.tenantId, c.unitId).auditLog.create({
        data: {
          tenantId: c.tenantId,
          unitId: c.unitId,
          actorType: actorUserId ? "USER" : "SYSTEM",
          actorId: actorUserId ?? "module:hotel",
          action: "hotel.booking.deposit_unforfeited",
          targetType: "HotelReservation",
          targetId: b.reservationId,
          before: { forfeitSaleId: b.saleId, status: "PAID" },
          after: { forfeitSaleId: b.saleId, status: "VOIDED", reason: "เข้าพักหลังย้อนไม่มา" },
        },
      });
      restored++;
    } catch (e) {
      warnings.push(`คืนมัดจำที่ริบของ ${b.code} ไม่สำเร็จ (${(e instanceof Error ? e.message : String(e)).slice(0, 100)}) — ยกเลิกบิลริบ #${b.receiptNo ?? b.saleId} ที่หน้าขาย`);
    }
  }
  return { restored, warnings };
}

// ───────────────────────── CSV ─────────────────────────
const BOM = "﻿";
const bahtStr = (satang: unknown): string => {
  const v = Math.trunc(n(satang));
  const a = Math.abs(v);
  return `${v < 0 ? "-" : ""}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};
const pctStr = (bp: unknown): string => (n(bp) / 100).toFixed(1);
const cell = (v: unknown): string | number => (typeof v === "number" ? v : typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
type Col = { th: string; get: (r: Record<string, unknown>) => string | number };
const COLS: Record<CsvKind, Col[]> = {
  occupancy: [
    { th: "ช่วง", get: (r) => cell(r.period ?? r.date) },
    { th: "ห้องที่มีแขก", get: (r) => cell(r.occupied) },
    { th: "ห้องขายได้", get: (r) => cell(r.available) },
    { th: "อัตราเข้าพัก (%)", get: (r) => pctStr(r.occupancyBps) },
    { th: "รายได้ห้อง (บาท)", get: (r) => bahtStr(r.revenueSatang) },
    { th: "ADR (บาท)", get: (r) => bahtStr(r.adrSatang) },
    { th: "RevPAR (บาท)", get: (r) => bahtStr(r.revparSatang) },
    { th: "ปิดวันแล้ว", get: (r) => (r.closed === true ? "ใช่" : r.closed === false ? "ยังไม่ปิด" : "") },
  ],
  revenue: [
    { th: "กลุ่ม", get: (r) => cell(r.key) },
    { th: "ชื่อ", get: (r) => cell(r.label) },
    { th: "รายได้ห้อง (บาท)", get: (r) => bahtStr(r.roomRevenueSatang) },
    { th: "รายได้อื่น (บาท)", get: (r) => bahtStr(r.otherRevenueSatang) },
    { th: "รวม (บาท)", get: (r) => bahtStr(r.totalSatang) },
    { th: "ภาษีมูลค่าเพิ่มในยอดรวม (บาท)", get: (r) => bahtStr(r.vatSatang) },
  ],
  funnel: [
    { th: "แหล่งจอง", get: (r) => cell(r.label ?? r.source) },
    { th: "จอง", get: (r) => cell(r.created) },
    { th: "ยืนยัน", get: (r) => cell(r.confirmed) },
    { th: "ยกเลิก", get: (r) => cell(r.cancelled) },
    { th: "ไม่มา", get: (r) => cell(r.noShow) },
    { th: "อัตรายืนยัน (%)", get: (r) => pctStr(r.confirmRateBps) },
    { th: "อัตรายกเลิก (%)", get: (r) => pctStr(r.cancelRateBps) },
    { th: "จองล่วงหน้าเฉลี่ย (วัน)", get: (r) => cell(r.leadTimeDaysAvg) },
    { th: "พักเฉลี่ย (คืน)", get: (r) => cell(r.alosNights) },
    { th: "เหตุผลยกเลิก", get: (r) => (Array.isArray(r.cancelReasons) ? r.cancelReasons.filter(isRec).map((x) => `${String(x.reason ?? "")} (${n(x.count)})`).join("; ") : "") },
  ],
  forecast: [
    { th: "วันที่", get: (r) => cell(r.date) },
    { th: "ห้องที่จองแล้ว", get: (r) => cell(r.onBooks) },
    { th: "ห้องขายได้", get: (r) => cell(r.available) },
    { th: "อัตราเข้าพัก (%)", get: (r) => pctStr(r.occupancyBps) },
  ],
  housekeeping: [
    { th: "วันที่", get: (r) => cell(r.date) },
    { th: "ห้องที่ทำเสร็จ", get: (r) => cell(r.cleaned) },
  ],
  housekeepingUsers: [
    { th: "พนักงาน", get: (r) => cell(r.name) },
    { th: "รหัสผู้ใช้", get: (r) => cell(r.userId) },
    { th: "ห้องที่ทำเสร็จ", get: (r) => cell(r.cleaned) },
  ],
  deposits: [
    { th: "ถือห้องรอมัดจำ", get: (r) => cell(r.holdActive) },
    { th: "มัดจำค้างรับ (บาท)", get: (r) => bahtStr(r.depositPendingSatang) },
    { th: "มัดจำที่ริบ (บาท)", get: (r) => bahtStr(r.forfeitedSatang) },
    { th: "มัดจำที่คืน (บาท)", get: (r) => bahtStr(r.refundedSatang) },
  ],
  history: [
    { th: "วันที่", get: (r) => cell(r.businessDate) },
    { th: "สถานะ", get: (r) => (r.status === "REOPENED" ? "เปิดอีกครั้ง" : "ปิดแล้ว") },
    { th: "ห้องที่มีแขก", get: (r) => cell(r.roomsOccupied) },
    { th: "ห้องขายได้", get: (r) => cell(r.roomsAvailable) },
    { th: "อัตราเข้าพัก (%)", get: (r) => pctStr(r.occupancyBps) },
    { th: "รายได้ห้อง (บาท)", get: (r) => bahtStr(r.roomRevenueSatang) },
    { th: "ไม่มา", get: (r) => cell(r.noShowCount) },
  ],
};
export const CSV_KINDS = Object.keys(COLS) as CsvKind[];
export const isCsvKind = (v: unknown): v is CsvKind => typeof v === "string" && (CSV_KINDS as string[]).includes(v);

/** ป้ายแถวรวมต่อชนิด (ช่องแรกของตาราง) */
const TOTAL_LABEL: Partial<Record<CsvKind, Record<string, unknown>>> = {
  occupancy: { period: "รวม" },
  revenue: { key: "รวม", label: "รวมทั้งหมด" },
  funnel: { label: "รวมทุกแหล่ง" },
  housekeeping: { date: "รวม" },
  housekeepingUsers: { name: "รวม", userId: "" },
};
/**
 * ตาราง ⇒ CSV (UTF-8 BOM · หัวตารางไทย · ทุกช่องผ่าน csvRow กันสูตร X6) · kind ไม่รู้จัก ⇒ "" (ไม่ throw) ·
 * total (ไม่บังคับ) = แถวรวมท้ายตาราง (ตัวเลขจาก DTO total ของรายงาน) · วันที่คงรูป ISO ปปปป-ดด-วว (เครื่องอ่านได้)
 */
export function exportCsv(kind: unknown, rows: unknown, total?: unknown): string {
  if (!isCsvKind(kind)) return "";
  const cols = COLS[kind];
  const list = Array.isArray(rows) ? rows.filter(isRec) : [];
  const lines = [csvRow(cols.map((c) => c.th)), ...list.map((r) => csvRow(cols.map((c) => c.get(r))))];
  if (isRec(total)) {
    const t = { ...total, ...(TOTAL_LABEL[kind] ?? {}) };
    lines.push(csvRow(cols.map((c) => c.get(t))));
  }
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
