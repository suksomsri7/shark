// SVC H.2 ▸ ปฏิทินห้อง (tape chart) + KPI หน้าเคาน์เตอร์ — อ่านอย่างเดียว (ใบสั่ง ledger/svc-briefs/svc-brief-h.2.md §2 มติ 1/4/5/6 · §3.1 · §3.3 · §7)
//   • tape chart = มุมมองของข้อมูลที่ H.3 เขียน (HotelReservation · HotelBookingNight · RoomOccupancy) — ไม่มีการเขียนในไฟล์นี้
//   • แถวห้อง = ห้อง active ที่ขายรายคืนได้ (NIGHTLY/BOTH) เรียง อาคาร → ชั้น → เลขห้อง · จัดกลุ่มตามประเภท (sortOrder) · หัวกลุ่มราคาวันนี้/สุดสัปดาห์ถัดไปจาก H.1 (resolveNightPrice)
//   • แถบ: CHECKED_IN → STAY · HOLD → HOLD · CONFIRMED + OTA → OTA · CONFIRMED → CONFIRMED · RoomOccupancy BLOCK/LEASE
//     การจองแสดงเมื่อ checkIn < ปลายกริด และ checkOut ≥ ต้นกริด (ครึ่งวันเช็กเอาต์) · BLOCK/LEASE เมื่อ start < ปลาย และ end > ต้น · from/to = วันจริง ไม่ตัดตามกริด
//   • อัตราเข้าพักรายคืน: sellable = แถวห้อง − BLOCK − LEASE ที่ครอบคืน · occupied = คืน counted ของการจอง HOLD/CONFIRMED/CHECKED_IN (มีห้องหรือไม่ก็นับ)
//   • ประสิทธิภาพ (มติ 6): tapeChart = 6 คำสั่งคงที่ (กรอบหน่วย+ประเภท+ห้อง+ราคา 1 · ค่าตั้ง 2 · occupancy+สัญญาหอ+เหตุผลปิดห้อง 1 · การจอง 1 · คืน 1) ไม่ขึ้นกับจำนวนห้อง/วัน
//   • ฟังก์ชันรับ (ctx {tenantId}, input {unitId,…}) ไม่รับ actor — หน้าเรียกหลังตรวจสิทธิ์เอง · ข้ามร้าน/ข้ามหน่วย/ไม่ใช่โรงแรม ⇒ NOT_FOUND · ไม่มีเบอร์/อีเมลใน DTO (X10)
import { tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettingsMany } from "@/lib/core/settings";
import { addDaysYmd, dayNumber, dayOfWeekOf, isYmd, nightDates, quoteStay, resolveNightPrice, type FallbackRate, type OverrideRow, type PricingContext, type RateRow, type RoundingMode, type SeasonRow } from "./pricing";
import { loadPricingContext } from "./rates";

// ───────────────────────── ชนิด ─────────────────────────
export type TapeBarKind = "STAY" | "CONFIRMED" | "HOLD" | "OTA" | "BLOCK" | "LEASE";
export type TapeBar = {
  kind: TapeBarKind;
  /** id การจอง · blockId (BLOCK) · id สัญญา (LEASE) */
  refId: string;
  label: string;
  /** วันเข้า/วันเริ่ม (ymd) */
  from: string;
  /** วันออก/วันจบ (ymd · ไม่รวม) */
  to: string;
  holdExpiresAt: string | null;
  guestName: string | null;
  source: string | null;
  groupId: string | null;
  href: string | null;
  code: string | null;
  status: string | null;
  roomTypeId: string | null;
  roomId: string | null;
  reason: string | null;
  /** หน่วยหอของสัญญา (LEASE) — หน้าใช้ตัดสินลิงก์ด้วยสิทธิ์ dorm.view */
  leaseUnitId: string | null;
};
export type TapeRoom = { roomId: string; number: string; floorNo: number | null; hkStatus: string; bars: TapeBar[] };
export type TapeGroup = { roomTypeId: string; name: string; rateTodaySatang: number; rateWeekendSatang: number; rooms: TapeRoom[]; unassigned: TapeBar[] };
export type TapeOccupancyDay = { date: string; occupied: number; sellable: number };
export type TapeLegendItem = { kind: TapeBarKind; labelTh: string };
export type TapeChartOk = {
  ok: true;
  unitSlug: string;
  from: string;
  today: string;
  days: string[];
  groups: TapeGroup[];
  occupancy: TapeOccupancyDay[];
  legend: TapeLegendItem[];
};
export type TapeFail = { ok: false; code: "NOT_FOUND" | "INVALID_RANGE" | "INVALID_INPUT"; reason: string };
export type HotelTodayOk = {
  ok: true;
  today: string;
  arrivals: number;
  departures: number;
  inHouse: number;
  sellable: number;
  blocked: number;
  leased: number;
  hkDirty: number;
  weekOccBps: number;
  weekendOccBps: number;
  adrSatang: number;
  arrivalNames: string[];
  departureNames: string[];
  arrivalRooms: string[];
  departureRooms: string[];
  blockedRooms: string[];
  leasedRooms: string[];
  dirtyRooms: string[];
};

/** เพดานจำนวนวันต่อครั้ง (เดือนยาวสุด 31 · เผื่อมุมมองอื่น) */
export const TAPE_MAX_DAYS = 62;
const ACTIVE = ["HOLD", "CONFIRMED", "CHECKED_IN"];
const WEEKEND_FRI_SAT = [5, 6];
const KEY = { weekendDays: "rooms.hotel.weekendDays", rounding: "rooms.money.rounding", baseRate: "rooms.hotel.baseRate", dowAdjust: "rooms.hotel.dayOfWeekAdjustBp" } as const;
const LEGEND: TapeLegendItem[] = [
  { kind: "STAY", labelTh: "พักอยู่" },
  { kind: "CONFIRMED", labelTh: "จองแล้ว" },
  { kind: "OTA", labelTh: "มาจาก OTA" },
  { kind: "HOLD", labelTh: "ถือไว้ รอมัดจำ" },
  { kind: "BLOCK", labelTh: "ปิดซ่อม" },
  { kind: "LEASE", labelTh: "เช่ารายเดือน (ระบบหอ)" },
];
const SOURCE_TH: Record<string, string> = { WALK_IN: "เดินเข้า", PHONE: "โทรจอง", WEB: "หน้าเว็บ", LINE: "LINE", OTA: "OTA" };
const R = { notFound: "ไม่พบโรงแรมนี้", range: "ช่วงวันที่ไม่ถูกต้อง" };

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ymdOf = (d: Date | string): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const covers = (start: string, end: string, d: string): boolean => start <= d && d < end;
const sellsNightly = (roomMode: string | null, typeMode: string): boolean => {
  const m = roomMode ?? typeMode;
  return m === "NIGHTLY" || m === "BOTH";
};
/** แปลงค่า json จาก $queryRaw (driver อาจคืนเป็นสตริงหรืออ็อบเจกต์) */
function jsonArr<T>(v: unknown): T[] {
  const x: unknown = typeof v === "string" ? JSON.parse(v) : v;
  return Array.isArray(x) ? (x as T[]) : [];
}
const notFound = (): TapeFail => ({ ok: false, code: "NOT_FOUND", reason: R.notFound });

// ───────────────────────── คิวรีกรอบหน่วย (1 คำสั่ง) ─────────────────────────
type TypeJ = { id: string; name: string; sortOrder: number; rentMode: string; active: boolean };
type RoomJ = { id: string; number: string; roomTypeId: string; floorNo: number | null; rentMode: string | null; hkStatus: string; bSort: number | null };
type RateJ = { roomTypeId: string; seasonId: string | null; wd: number; we: number; hol: number | null };
type SeasonJ = { id: string; name: string; dateStart: string; dateEnd: string; priority: number; status: string };
type OverrideJ = { roomTypeId: string; ratePlanId: string | null; date: string; priceSatang: number };
type FrameRow = { unitType: string; slug: string; planId: string | null; types: unknown; rooms: unknown; rates: unknown; seasons: unknown; overrides: unknown; holidays: unknown };
type Frame = { slug: string; planId: string | null; types: TypeJ[]; rooms: RoomJ[]; rates: RateJ[]; seasons: SeasonJ[]; overrides: OverrideJ[]; holidays: string[] };

/** หน่วย + ประเภท + ห้อง (+ อาคาร) + ราคาของแผนเริ่มต้น (ฤดู · แก้มือ/วันหยุดในช่วง [pFrom, pTo]) — คำสั่งเดียว */
async function loadFrame(tenantId: string, unitId: string, pFrom: string, pTo: string, withPricing: boolean): Promise<Frame | null> {
  const db = tenantDb({ tenantId, unitId });
  const rows = await db.$queryRaw<FrameRow[]>`
    WITH plan AS (
      SELECT p."id" FROM "HotelRatePlan" p
       WHERE p."tenantId" = ${tenantId} AND p."unitId" = ${unitId} AND p."status" = 'ACTIVE' AND ${withPricing}
       ORDER BY p."isDefault" DESC, p."sortOrder" ASC, p."createdAt" ASC LIMIT 1
    )
    SELECT u."type"::text AS "unitType", u."slug" AS "slug",
      (SELECT "id" FROM plan) AS "planId",
      (SELECT coalesce(json_agg(json_build_object('id', t."id", 'name', t."name", 'sortOrder', t."sortOrder", 'rentMode', t."rentMode", 'active', t."active") ORDER BY t."sortOrder", t."name"), '[]'::json)
         FROM "HotelRoomType" t WHERE t."tenantId" = u."tenantId" AND t."unitId" = u."id") AS "types",
      (SELECT coalesce(json_agg(json_build_object('id', r."id", 'number', r."number", 'roomTypeId', r."roomTypeId", 'floorNo', r."floorNo", 'rentMode', r."rentMode", 'hkStatus', r."hkStatus", 'bSort', b."sortOrder")), '[]'::json)
         FROM "HotelRoom" r LEFT JOIN "RoomBuilding" b ON b."id" = r."buildingId"
        WHERE r."tenantId" = u."tenantId" AND r."unitId" = u."id" AND r."active" = true) AS "rooms",
      (SELECT coalesce(json_agg(json_build_object('roomTypeId', x."roomTypeId", 'seasonId', x."seasonId", 'wd', x."priceWeekdaySatang", 'we', x."priceWeekendSatang", 'hol', x."priceHolidaySatang")), '[]'::json)
         FROM "HotelRate" x LEFT JOIN "HotelSeason" s ON s."id" = x."seasonId"
        WHERE x."tenantId" = u."tenantId" AND x."unitId" = u."id" AND x."ratePlanId" = (SELECT "id" FROM plan) AND (x."seasonId" IS NULL OR s."status" = 'ACTIVE')) AS "rates",
      (SELECT coalesce(json_agg(json_build_object('id', s."id", 'name', s."name", 'dateStart', s."dateStart", 'dateEnd', s."dateEnd", 'priority', s."priority", 'status', s."status")), '[]'::json)
         FROM "HotelSeason" s WHERE s."tenantId" = u."tenantId" AND s."unitId" = u."id" AND s."status" = 'ACTIVE' AND ${withPricing}) AS "seasons",
      (SELECT coalesce(json_agg(json_build_object('roomTypeId', o."roomTypeId", 'ratePlanId', o."ratePlanId", 'date', o."date", 'priceSatang', o."priceSatang")), '[]'::json)
         FROM "HotelRateOverride" o WHERE o."tenantId" = u."tenantId" AND o."unitId" = u."id" AND ${withPricing} AND o."date" >= ${pFrom}::date AND o."date" <= ${pTo}::date) AS "overrides",
      (SELECT coalesce(json_agg(h."date"), '[]'::json)
         FROM "HotelHoliday" h WHERE h."tenantId" = u."tenantId" AND h."unitId" = u."id" AND ${withPricing} AND h."date" >= ${pFrom}::date AND h."date" <= ${pTo}::date) AS "holidays"
    FROM "BusinessUnit" u
    WHERE u."id" = ${unitId} AND u."tenantId" = ${tenantId}`;
  const f = rows[0];
  if (!f || f.unitType !== "HOTEL") return null;
  return {
    slug: f.slug,
    planId: f.planId,
    types: jsonArr<TypeJ>(f.types),
    rooms: jsonArr<RoomJ>(f.rooms),
    rates: jsonArr<RateJ>(f.rates),
    seasons: jsonArr<SeasonJ>(f.seasons).map((s) => ({ ...s, dateStart: ymdOf(s.dateStart), dateEnd: ymdOf(s.dateEnd) })),
    overrides: jsonArr<OverrideJ>(f.overrides).map((o) => ({ ...o, date: ymdOf(o.date) })),
    holidays: jsonArr<string>(f.holidays).map((d) => ymdOf(d)),
  };
}

/** แถวห้องของ tape chart (มติ 1): active (คิวรีกรองแล้ว) · ขายรายคืนได้ · อาคาร → ชั้น → เลขห้อง */
function tapeRoomsOf(fr: Frame): RoomJ[] {
  const typeMode = new Map(fr.types.map((t) => [t.id, t.rentMode]));
  return fr.rooms
    .filter((r) => typeMode.has(r.roomTypeId) && sellsNightly(r.rentMode, typeMode.get(r.roomTypeId) ?? "NIGHTLY"))
    .sort((a, b) => (a.bSort ?? 0) - (b.bSort ?? 0) || (a.floorNo ?? 0) - (b.floorNo ?? 0) || a.number.localeCompare(b.number, "th", { numeric: true }));
}

// ───────────────────────── occupancy BLOCK/LEASE + สัญญาหอ + เหตุผลปิดห้อง (1 คำสั่ง) ─────────────────────────
type OccRow = { id: string; roomId: string; kind: string; refId: string; startDate: Date; endDate: Date; reason: string | null; leaseName: string | null; leaseUnitId: string | null; leaseUnitSlug: string | null };
function loadHeld(tenantId: string, unitId: string, from: string, to: string): Promise<OccRow[]> {
  return tenantDb({ tenantId, unitId }).$queryRaw<OccRow[]>`
    SELECT o."id", o."roomId", o."kind", o."refId", o."startDate", o."endDate",
      CASE WHEN o."kind" = 'BLOCK' THEN (
        SELECT a."after"->>'reason' FROM "AuditLog" a
         WHERE a."tenantId" = o."tenantId" AND a."action" = 'hotel.room.blocked' AND a."targetId" = o."refId"
         ORDER BY a."createdAt" DESC LIMIT 1) END AS "reason",
      p."name" AS "leaseName", l."unitId" AS "leaseUnitId", bu."slug" AS "leaseUnitSlug"
    FROM "RoomOccupancy" o
    LEFT JOIN "DormLease" l ON o."kind" = 'LEASE' AND o."refType" = 'DormLease' AND l."id" = o."refId" AND l."tenantId" = o."tenantId"
    LEFT JOIN "Party" p ON p."id" = l."partyId" AND p."tenantId" = o."tenantId"
    LEFT JOIN "BusinessUnit" bu ON bu."id" = l."unitId" AND bu."tenantId" = o."tenantId"
    WHERE o."tenantId" = ${tenantId} AND o."unitId" = ${unitId} AND o."active" = true AND o."kind" IN ('BLOCK', 'LEASE')
      AND o."startDate" < ${to}::date AND o."endDate" > ${from}::date
      AND (o."holdExpiresAt" IS NULL OR o."holdExpiresAt" > now())`;
}

type NightAgg = { date: Date; n: number; sum: bigint | number | null };
/** คืน counted ของการจอง active ต่อวัน (จำนวน + ผลรวมราคา) — 1 คำสั่ง */
function loadNightAgg(tenantId: string, unitId: string, from: string, to: string): Promise<NightAgg[]> {
  return tenantDb({ tenantId, unitId }).$queryRaw<NightAgg[]>`
    SELECT n."date", count(*)::int AS "n", sum(n."priceSatang")::bigint AS "sum"
      FROM "HotelBookingNight" n JOIN "HotelReservation" r ON r."id" = n."reservationId" AND r."tenantId" = n."tenantId"
     WHERE n."tenantId" = ${tenantId} AND n."unitId" = ${unitId} AND n."counted" = true
       AND n."date" >= ${from}::date AND n."date" < ${to}::date
       AND r."status"::text IN ('HOLD', 'CONFIRMED', 'CHECKED_IN')
     GROUP BY n."date"`;
}

// ───────────────────────── ราคาหัวกลุ่ม (H.1 resolveNightPrice บนบริบทที่ประกอบจากคิวรีกรอบ) ─────────────────────────
const roundingOf = (v: unknown): RoundingMode => (v === "BAHT_HALF_UP" || v === "BAHT_DOWN" ? v : "SATANG");
const intArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : []);

async function headerPrices(tenantId: string, unitId: string, fr: Frame, today: string): Promise<Map<string, { today: number; weekend: number }>> {
  const out = new Map<string, { today: number; weekend: number }>();
  const typeIds = fr.types.map((t) => t.id);
  const planId = fr.planId;
  const refs = [{ unitId }, ...typeIds.map((id) => ({ unitId, roomTypeId: id, ...(planId ? { ratePlanId: planId } : {}) }))];
  const resolved = await resolveSettingsMany({ tenantId }, [KEY.weekendDays, KEY.rounding, KEY.baseRate, KEY.dowAdjust], refs);
  const unitSet = resolved[0] ?? {};
  const weekendDays = intArr(unitSet[KEY.weekendDays]?.value).filter((d) => d >= 0 && d <= 6);
  const fallback: Record<string, FallbackRate> = {};
  typeIds.forEach((id, i) => {
    const st = resolved[i + 1] ?? {};
    const base = st[KEY.baseRate]?.value;
    const adj = intArr(st[KEY.dowAdjust]?.value);
    fallback[id] = { baseRateSatang: typeof base === "number" ? base : null, dayOfWeekAdjustBp: adj.length === 7 ? adj : [0, 0, 0, 0, 0, 0, 0] };
  });
  const rates: RateRow[] = planId
    ? fr.rates.map((r) => ({ ratePlanId: planId, roomTypeId: r.roomTypeId, seasonId: r.seasonId, priceWeekdaySatang: r.wd, priceWeekendSatang: r.we, priceHolidaySatang: r.hol }))
    : [];
  const seasons: SeasonRow[] = fr.seasons.map((s) => ({ id: s.id, name: s.name, dateStart: s.dateStart, dateEnd: s.dateEnd, priority: s.priority, status: s.status }));
  const overrides: OverrideRow[] = fr.overrides.map((o) => ({ roomTypeId: o.roomTypeId, ratePlanId: o.ratePlanId, date: o.date, priceSatang: o.priceSatang }));
  const pc: PricingContext = {
    weekendDays,
    rounding: roundingOf(unitSet[KEY.rounding]?.value),
    today,
    roomTypes: {},
    plans: [],
    seasons,
    holidays: new Set(fr.holidays),
    rates,
    overrides,
    fallback,
  };
  const week = Array.from({ length: 7 }, (_, i) => addDaysYmd(today, i));
  const nextWeekend = week.find((d) => weekendDays.includes(dayOfWeekOf(d))) ?? today;
  for (const id of typeIds) {
    const at = (date: string) => (planId ? resolveNightPrice(pc, { roomTypeId: id, ratePlanId: planId, date })?.priceSatang : null) ?? (fallback[id]?.baseRateSatang ?? 0);
    out.set(id, { today: at(today), weekend: at(nextWeekend) });
  }
  return out;
}

// ───────────────────────── tapeChart ─────────────────────────
type RvRow = { id: string; code: string; status: string; source: string; roomId: string | null; roomTypeId: string; checkInDate: Date; checkOutDate: Date; guestName: string; holdExpiresAt: Date | null; groupId: string | null; channelRef: string | null };

function rvLabel(rv: RvRow, kind: TapeBarKind): string {
  if (kind === "STAY") return `${rv.guestName} · พักอยู่`;
  if (kind === "HOLD") return `${rv.guestName} · ถือไว้ · รอมัดจำ`;
  if (kind === "OTA") return `${rv.guestName} · OTA${rv.channelRef ? ` ${rv.channelRef}` : ""}`;
  return `${rv.guestName} · ${SOURCE_TH[rv.source] ?? rv.source}${rv.groupId ? " · กลุ่ม" : ""}`;
}
const kindOfRv = (status: string, source: string): TapeBarKind | null =>
  status === "CHECKED_IN" ? "STAY" : status === "HOLD" ? "HOLD" : status === "CONFIRMED" ? (source === "OTA" ? "OTA" : "CONFIRMED") : null;
const byFromThenId = (a: TapeBar, b: TapeBar) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.refId.localeCompare(b.refId));

/**
 * ปฏิทินห้อง [from, from+days) — days = 7 / 14 / จำนวนวันของเดือน (≤ 62) · input ผิด ⇒ ok:false ไม่ throw
 * ctx = { tenantId } · ไม่ใช่โรงแรมของร้าน ⇒ NOT_FOUND
 */
export async function tapeChart(ctx: unknown, input: unknown): Promise<TapeChartOk | TapeFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  if (!isStr(tenantId) || !isStr(unitId)) return notFound();
  const from = isRec(input) ? input.from : null;
  const days = isRec(input) ? input.days : null;
  if (!isYmd(from) || typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > TAPE_MAX_DAYS) return { ok: false, code: "INVALID_RANGE", reason: R.range };
  const to = addDaysYmd(from, days);
  const today = bkkYmd(new Date());
  const pTo = addDaysYmd(today, 6);
  const fr = await loadFrame(tenantId, unitId, today, pTo, true);
  if (!fr) return notFound();
  const db = tenantDb({ tenantId, unitId });
  const [prices, held, rvs, nightAgg] = await Promise.all([
    headerPrices(tenantId, unitId, fr, today),
    loadHeld(tenantId, unitId, from, to),
    db.hotelReservation.findMany({
      where: { status: { in: ["HOLD", "CONFIRMED", "CHECKED_IN"] }, checkInDate: { lt: new Date(`${to}T00:00:00.000Z`) }, checkOutDate: { gte: new Date(`${from}T00:00:00.000Z`) } },
      select: { id: true, code: true, status: true, source: true, roomId: true, roomTypeId: true, checkInDate: true, checkOutDate: true, guestName: true, holdExpiresAt: true, groupId: true, channelRef: true },
      orderBy: [{ checkInDate: "asc" }, { code: "asc" }],
    }),
    loadNightAgg(tenantId, unitId, from, to),
  ]);
  const rooms = tapeRoomsOf(fr);
  const roomIds = new Set(rooms.map((r) => r.id));
  const barsOf = new Map<string, TapeBar[]>(rooms.map((r) => [r.id, []]));
  const unassignedOf = new Map<string, TapeBar[]>();
  const base = `/app/u/${fr.slug}/hotel/reservations`;
  for (const rv of rvs) {
    const kind = kindOfRv(rv.status, rv.source);
    if (!kind) continue;
    const bar: TapeBar = {
      kind,
      refId: rv.id,
      label: rvLabel(rv, kind),
      from: ymdOf(rv.checkInDate),
      to: ymdOf(rv.checkOutDate),
      holdExpiresAt: kind === "HOLD" && rv.holdExpiresAt ? rv.holdExpiresAt.toISOString() : null,
      guestName: rv.guestName,
      source: rv.source,
      groupId: rv.groupId,
      href: `${base}/${rv.id}`,
      code: rv.code,
      status: rv.status,
      roomTypeId: rv.roomTypeId,
      roomId: rv.roomId,
      reason: null,
      leaseUnitId: null,
    };
    if (rv.roomId === null) {
      const list = unassignedOf.get(rv.roomTypeId) ?? [];
      list.push(bar);
      unassignedOf.set(rv.roomTypeId, list);
    } else if (roomIds.has(rv.roomId)) barsOf.get(rv.roomId)?.push(bar);
  }
  for (const o of held) {
    if (!roomIds.has(o.roomId)) continue;
    const s = ymdOf(o.startDate);
    const e = ymdOf(o.endDate);
    const isBlock = o.kind === "BLOCK";
    const label = isBlock
      ? `ปิดซ่อม${o.reason ? ` · ${o.reason}` : ""}`
      : `ปล่อยรายเดือน (ระบบหอ)${o.leaseName ? ` · ${o.leaseName}` : ""} · ถึง ${e}`;
    barsOf.get(o.roomId)?.push({
      kind: isBlock ? "BLOCK" : "LEASE",
      refId: o.refId,
      label,
      from: s,
      to: e,
      holdExpiresAt: null,
      guestName: null,
      source: null,
      groupId: null,
      href: !isBlock && o.leaseUnitSlug ? `/app/u/${o.leaseUnitSlug}/dorm/tenants?room=${encodeURIComponent(o.roomId)}` : null,
      code: null,
      status: null,
      roomTypeId: null,
      roomId: o.roomId,
      reason: isBlock ? o.reason : null,
      leaseUnitId: isBlock ? null : o.leaseUnitId,
    });
  }
  const groups: TapeGroup[] = [];
  for (const t of fr.types) {
    const rs = rooms.filter((r) => r.roomTypeId === t.id);
    const un = (unassignedOf.get(t.id) ?? []).sort((a, b) => a.refId.localeCompare(b.refId));
    if (!rs.length && !un.length) continue;
    const p = prices.get(t.id) ?? { today: 0, weekend: 0 };
    groups.push({
      roomTypeId: t.id,
      name: t.name,
      rateTodaySatang: p.today,
      rateWeekendSatang: p.weekend,
      rooms: rs.map((r) => ({ roomId: r.id, number: r.number, floorNo: r.floorNo, hkStatus: r.hkStatus, bars: (barsOf.get(r.id) ?? []).sort(byFromThenId) })),
      unassigned: un,
    });
  }
  const dayList = nightDates(from, to);
  const occByDate = new Map(nightAgg.map((n) => [ymdOf(n.date), Number(n.n)]));
  const occupancy = dayList.map((d) => {
    const off = new Set(held.filter((o) => roomIds.has(o.roomId) && covers(ymdOf(o.startDate), ymdOf(o.endDate), d)).map((o) => o.roomId));
    return { date: d, occupied: occByDate.get(d) ?? 0, sellable: rooms.length - off.size };
  });
  return { ok: true, unitSlug: fr.slug, from, today, days: dayList, groups, occupancy, legend: LEGEND };
}

// ───────────────────────── hotelToday (KPI หน้าเคาน์เตอร์ · ภาพ 08 แถบบน) ─────────────────────────
/**
 * เข้าวันนี้ (CONFIRMED เข้า=วันนี้) · ออกวันนี้ (CHECKED_IN ออก=วันนี้) · พักอยู่คืนนี้ (CHECKED_IN/CONFIRMED ครอบคืนนี้ · ไม่รวม HOLD)
 * ขายได้ = แถวห้อง − ปิดซ่อม − รายเดือน (คืนนี้) · แม่บ้านรอทำ = แถวห้อง DIRTY
 * สัปดาห์นี้ = 7 วันนับจากวันนี้ (Σoccupied/Σsellable · bp ปัดใกล้) · ADR = Σ ราคาคืน counted ÷ จำนวนคืน (ปัดลง) · ศ.–ส. = เฉพาะวันศุกร์/เสาร์ใน 7 วัน
 * now (ISO) = จุดเวลาที่ใช้แทน "วันนี้" · ≤ 4 คำสั่ง
 */
export async function hotelToday(ctx: unknown, input: unknown): Promise<HotelTodayOk | TapeFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  if (!isStr(tenantId) || !isStr(unitId)) return notFound();
  const nowIn = isRec(input) ? input.now : undefined;
  const nowD = typeof nowIn === "string" || nowIn instanceof Date ? new Date(nowIn) : new Date();
  if (Number.isNaN(nowD.getTime())) return { ok: false, code: "INVALID_INPUT", reason: "เวลาไม่ถูกต้อง" };
  const today = bkkYmd(nowD);
  const weekEnd = addDaysYmd(today, 7);
  const fr = await loadFrame(tenantId, unitId, today, today, false);
  if (!fr) return notFound();
  const db = tenantDb({ tenantId, unitId });
  const todayD = new Date(`${today}T00:00:00.000Z`);
  const [held, rvs, nightAgg] = await Promise.all([
    loadHeld(tenantId, unitId, today, weekEnd),
    db.hotelReservation.findMany({
      where: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, checkInDate: { lte: todayD }, checkOutDate: { gte: todayD } },
      select: { id: true, status: true, checkInDate: true, checkOutDate: true, guestName: true, roomId: true },
      orderBy: [{ checkInDate: "asc" }, { code: "asc" }],
    }),
    loadNightAgg(tenantId, unitId, today, weekEnd),
  ]);
  const rooms = tapeRoomsOf(fr);
  const numberOf = new Map(fr.rooms.map((r) => [r.id, r.number]));
  const roomIds = new Set(rooms.map((r) => r.id));
  const heldOn = (kind: string, d: string) => new Set(held.filter((o) => o.kind === kind && roomIds.has(o.roomId) && covers(ymdOf(o.startDate), ymdOf(o.endDate), d)).map((o) => o.roomId));
  const blockedToday = heldOn("BLOCK", today);
  const leasedToday = heldOn("LEASE", today);
  const arrivals = rvs.filter((r) => r.status === "CONFIRMED" && ymdOf(r.checkInDate) === today);
  const departures = rvs.filter((r) => r.status === "CHECKED_IN" && ymdOf(r.checkOutDate) === today);
  const inHouse = rvs.filter((r) => covers(ymdOf(r.checkInDate), ymdOf(r.checkOutDate), today));
  const dirty = rooms.filter((r) => r.hkStatus === "DIRTY");
  const agg = new Map(nightAgg.map((n) => [ymdOf(n.date), { n: Number(n.n), sum: Number(n.sum ?? 0) }]));
  let occ = 0;
  let sell = 0;
  let wOcc = 0;
  let wSell = 0;
  let nights = 0;
  let revenue = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysYmd(today, i);
    const off = new Set([...heldOn("BLOCK", d), ...heldOn("LEASE", d)]);
    const s = rooms.length - off.size;
    const a = agg.get(d) ?? { n: 0, sum: 0 };
    occ += a.n;
    sell += s;
    nights += a.n;
    revenue += a.sum;
    if (WEEKEND_FRI_SAT.includes(dayOfWeekOf(d))) {
      wOcc += a.n;
      wSell += s;
    }
  }
  const room = (id: string | null) => (id ? (numberOf.get(id) ?? "") : "");
  return {
    ok: true,
    today,
    arrivals: arrivals.length,
    departures: departures.length,
    inHouse: inHouse.length,
    sellable: rooms.length - blockedToday.size - leasedToday.size,
    blocked: blockedToday.size,
    leased: leasedToday.size,
    hkDirty: dirty.length,
    weekOccBps: sell ? Math.round((occ * 10_000) / sell) : 0,
    weekendOccBps: wSell ? Math.round((wOcc * 10_000) / wSell) : 0,
    adrSatang: nights ? Math.floor(revenue / nights) : 0,
    arrivalNames: arrivals.slice(0, 2).map((r) => r.guestName),
    departureNames: departures.slice(0, 2).map((r) => r.guestName),
    arrivalRooms: arrivals.slice(0, 2).map((r) => room(r.roomId)),
    departureRooms: departures.slice(0, 2).map((r) => room(r.roomId)),
    blockedRooms: [...blockedToday].map((id) => room(id)),
    leasedRooms: [...leasedToday].map((id) => room(id)),
    dirtyRooms: dirty.map((r) => r.number),
  };
}

// ───────────────────────── ราคาก่อนยืนยันการลาก (ไดอะล็อก · อ่านอย่างเดียว) ─────────────────────────
export type MovePreview = { ok: true; nights: number; addedNights: { date: string; priceSatang: number }[]; addedSatang: number; keptSatang: number; totalSatang: number } | TapeFail;
/**
 * ราคาโดยประมาณเมื่อเลื่อน/ยืดการจอง: คืนที่ยังนับอยู่คงราคาเดิม · คืนใหม่ = quote ปัจจุบันของแผนการจอง (เหมือน rescheduleBooking ของ H.3)
 * ย้ายข้ามประเภทไม่คิดส่วนต่าง (S:911) ⇒ คืนเดิมไม่เปลี่ยนราคา · ไม่มีแผน/ราคา ⇒ ใช้ราคาต่อคืนเดิมของการจอง
 */
export async function previewMove(ctx: unknown, input: unknown): Promise<MovePreview> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const unitId = isRec(input) ? input.unitId : null;
  const id = isRec(input) ? input.id : null;
  if (!isStr(tenantId) || !isStr(unitId) || !isStr(id)) return notFound();
  const db = tenantDb({ tenantId, unitId });
  const rv = await db.hotelReservation.findFirst({ where: { id }, select: { id: true, roomTypeId: true, ratePlanId: true, ratePerNightSatang: true, checkInDate: true, checkOutDate: true } });
  if (!rv) return notFound();
  const ci = isRec(input) && isYmd(input.checkIn) ? input.checkIn : ymdOf(rv.checkInDate);
  const co = isRec(input) && isYmd(input.checkOut) ? input.checkOut : ymdOf(rv.checkOutDate);
  if (!(dayNumber(co) > dayNumber(ci))) return { ok: false, code: "INVALID_RANGE", reason: R.range };
  const counted = await db.hotelBookingNight.findMany({ where: { reservationId: rv.id, counted: true }, select: { date: true, priceSatang: true } });
  const keptBy = new Map(counted.map((n) => [ymdOf(n.date), n.priceSatang]));
  const dates = nightDates(ci, co);
  const fresh = dates.filter((d) => !keptBy.has(d));
  let addedNights: { date: string; priceSatang: number }[] = fresh.map((date) => ({ date, priceSatang: rv.ratePerNightSatang }));
  if (fresh.length) {
    const pc = await loadPricingContext({ tenantId }, unitId, { from: fresh[0], to: fresh[fresh.length - 1], ...(rv.ratePlanId ? { ratePlanId: rv.ratePlanId } : {}) });
    const plan = pc ? (pc.plans.find((p) => p.id === rv.ratePlanId) ?? pc.plans.find((p) => p.isDefault) ?? null) : null;
    if (pc && plan) {
      addedNights = fresh.map((date) => {
        const q = quoteStay({ ...pc, today: date < pc.today ? date : pc.today }, { roomTypeId: rv.roomTypeId, ratePlanId: plan.id, checkIn: date, checkOut: addDaysYmd(date, 1), limits: { minNights: null, maxNights: null, closedToArrival: false, maxAdvanceBookingDays: 100_000 } });
        return { date, priceSatang: q.ok ? q.nightsTotal : rv.ratePerNightSatang };
      });
    }
  }
  const keptSatang = dates.reduce((a, d) => a + (keptBy.get(d) ?? 0), 0);
  const addedSatang = addedNights.reduce((a, n) => a + n.priceSatang, 0);
  return { ok: true, nights: dates.length, addedNights, addedSatang, keptSatang, totalSatang: keptSatang + addedSatang };
}
