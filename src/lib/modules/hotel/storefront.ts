// SVC H.8 ▸ ชั้นข้อมูลของหน้าจองสาธารณะ (ใบสั่ง h.8 §1 · §9) — ผู้เรียกเดียว = `src/lib/platform/hotel-web.ts` / `hotel-mail.ts` (ผ่าน facade index.ts)
//   • อ่านอย่างเดียว · ไม่มีตรรกะเงิน/สถานะ (การจอง/ยกเลิก/มัดจำ = booking.ts เส้นเดียว)
//   • ทุกคิวรีผูก tenantId (+ unitId) ตรง · ทางที่ยังไม่รู้ร้าน (slug · id การจองจากอีเมล/งานเตือน) = $queryRaw ของ client ขยาย
//     แบบ sweepExpiredHolds (SQL ดิบไม่ผ่านตัวกรอง scope · ไม่ import prisma ดิบ — fitness F5) แล้วผูก tenantId ในเงื่อนไขเอง
//   • ผลไม่มีโทเคน/อีเมล/เบอร์เกินที่ผู้เรียกต้องใช้ — DTO สาธารณะประกอบที่ platform (ตัด/mask ที่นั่น)
//   • ข้อยกเว้นการเขียน (r2 ผู้ตรวจ A-6): webHoldMark จดแถวเครื่องหมาย «HOLD ของ client นี้» ใน ChatRateBucket (อายุตามรอบกวาดถัง 24 ชม.) — ไม่แตะการจอง
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { systemForUnit } from "@/lib/modules/system/service";
import { buildAvailability, type AvailabilityByDate } from "./availability";

const RESOLVE_SCOPE = "hotel-web-resolve";
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ymdOfDb = (d: Date): string => d.toISOString().slice(0, 10);
const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
const raw = () => tenantDb({ tenantId: RESOLVE_SCOPE });

export type WebUnit = { tenantId: string; tenantSlug: string; tenantName: string; unitId: string; unitSlug: string; unitName: string; unitStatus: string };
export type WebRoomTypeInfo = {
  id: string;
  name: string;
  capacity: number;
  baseOccupancy: number;
  maxOccupancy: number | null;
  bedType: string | null;
  description: string | null;
  images: string[];
  amenities: string[];
};
export type WebCancelRuleRow = { ratePlanId: string; daysBefore: number; refundBp: number };
export type WebSearchBundle = WebUnit & {
  roomTypes: WebRoomTypeInfo[];
  cancelRules: WebCancelRuleRow[];
  byDate: AvailabilityByDate;
  /** SVC H.8 r2 (ด่านกันยึดห้อง · มีเมื่อส่ง guard): ห้อง HOLD เว็บ/LINE ที่ยังไม่จ่ายและยังไม่หมดอายุ ต่อ (ประเภท, คืน) — snapshot เดียวกับ byDate */
  webHeld: { roomTypeId: string; date: string; n: number }[];
  /** ห้อง HOLD ที่ยังไม่จ่าย/ยังไม่หมดอายุ ที่ client นี้ถืออยู่ในหน่วยนี้ (นับจากแถวเครื่องหมาย webHoldMark) */
  clientHeld: number;
};
/** ด่านกันยึดห้อง: เวลาอ้างอิง + คำนำหน้ากุญแจเครื่องหมายของ client (`hw:hk:<หน่วย>:<client>:`) */
export type WebHoldGuardIn = { now: Date; markPrefix: string };
const MARK_PREFIX_RE = /^hw:hk:[0-9a-f]{12}:[0-9a-f]{32}:$/;

const strArr = (v: unknown, max = 20): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 500).slice(0, max) : []);
const numOr = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

type UnitRaw = { tenantId: string; tenantSlug: string; tenantName: string; unitId: string; unitSlug: string; unitName: string; unitStatus: string; types?: unknown; rules?: unknown; rooms?: unknown; occ?: unknown; nights?: unknown; held?: unknown; clientHeld?: unknown };

/** หน่วยโรงแรมจาก slug (ร้าน ACTIVE · หน่วย HOTEL สถานะ ACTIVE/PAUSED — PAUSED ยังดู/ยกเลิกการจองเดิมได้) · ไม่พบ = null (คิวรีเดียว) */
export async function webUnitBySlugs(tenantSlug: string, unitSlug: string): Promise<WebUnit | null> {
  const t = (tenantSlug ?? "").trim();
  const u = (unitSlug ?? "").trim();
  if (!t || !u || t.length > 100 || u.length > 100) return null;
  const rows = await raw().$queryRaw<UnitRaw[]>`
    SELECT t."id" AS "tenantId", t."slug" AS "tenantSlug", t."name" AS "tenantName", u."id" AS "unitId", u."slug" AS "unitSlug", u."name" AS "unitName", u."status"::text AS "unitStatus"
      FROM "BusinessUnit" u JOIN "Tenant" t ON t."id" = u."tenantId"
     WHERE t."slug" = ${t} AND u."slug" = ${u} AND u."type"::text = 'HOTEL' AND t."status"::text = 'ACTIVE' AND u."status"::text IN ('ACTIVE', 'PAUSED')
     LIMIT 1`;
  const r = rows[0];
  return r ? { tenantId: r.tenantId, tenantSlug: r.tenantSlug, tenantName: r.tenantName, unitId: r.unitId, unitSlug: r.unitSlug, unitName: r.unitName, unitStatus: r.unitStatus } : null;
}

/**
 * หน้าค้นหา: หน่วย + ประเภทห้อง (รูป/สิ่งอำนวยความสะดวก/เตียง) + กฎยกเลิกของทุกแผน + ห้องว่างช่วง [from, to) — คิวรีเดียว (กัน N+1 · ข้อสอบ SR-9 ≤ 14)
 * ห้องว่าง = buildAvailability (สูตรเดียวกับ hotelAvailability.get / availabilityInTx): ห้องขายรายคืนได้ − BLOCK − LEASE − คืนที่นับ
 */
export async function webSearchBundle(tenantSlug: string, unitSlug: string, from: string, to: string, guard?: WebHoldGuardIn): Promise<WebSearchBundle | null> {
  const t = (tenantSlug ?? "").trim();
  const u = (unitSlug ?? "").trim();
  if (!t || !u || t.length > 100 || u.length > 100 || !(to > from)) return null;
  const f = dbDate(from);
  const e = dbDate(to);
  // SVC H.8 r2 ▸ ด่านกันยึดห้อง (ผู้ตรวจ A-6): นับในคำสั่งเดียวกับห้องว่าง (snapshot เดียว — ยิงพร้อมกันไม่ได้ «ว่าง» กับ «ถือ» จากคนละเวลา) ◂
  const g = guard && guard.now instanceof Date && Number.isFinite(guard.now.getTime()) && MARK_PREFIX_RE.test(guard.markPrefix) ? guard : null;
  const guardSql = g
    ? Prisma.sql`COALESCE((SELECT json_agg(json_build_object('roomTypeId', h."roomTypeId", 'date', h."date", 'n', h."c"))
                   FROM (SELECT bn."roomTypeId", bn."date", count(*)::int AS "c" FROM "HotelBookingNight" bn JOIN "HotelReservation" hr ON hr."id" = bn."reservationId" AND hr."tenantId" = bn."tenantId"
                          WHERE bn."unitId" = u."id" AND bn."tenantId" = u."tenantId" AND bn."counted" = true AND bn."date" >= ${f} AND bn."date" < ${e}
                            AND hr."status"::text = 'HOLD' AND hr."source"::text IN ('WEB', 'LINE') AND hr."depositPaidAt" IS NULL AND hr."holdExpiresAt" > ${g.now}
                          GROUP BY bn."roomTypeId", bn."date") h), '[]'::json) AS "held",
           (SELECT count(*)::int FROM "HotelReservation" hr
             WHERE hr."unitId" = u."id" AND hr."tenantId" = u."tenantId" AND hr."status"::text = 'HOLD' AND hr."depositPaidAt" IS NULL AND hr."holdExpiresAt" > ${g.now}
               AND hr."id" IN (SELECT split_part(b."key", ':', 5) FROM "ChatRateBucket" b WHERE b."key" LIKE ${`${g.markPrefix}%`})) AS "clientHeld"`
    : Prisma.sql`'[]'::json AS "held", 0 AS "clientHeld"`;
  const rows = await raw().$queryRaw<UnitRaw[]>`
    SELECT t."id" AS "tenantId", t."slug" AS "tenantSlug", t."name" AS "tenantName", u."id" AS "unitId", u."slug" AS "unitSlug", u."name" AS "unitName", u."status"::text AS "unitStatus",
           COALESCE((SELECT json_agg(json_build_object('id', rt."id", 'name', rt."name", 'capacity', rt."capacity", 'baseOccupancy', rt."baseOccupancy", 'maxOccupancy', rt."maxOccupancy",
                                                       'bedType', rt."bedType", 'description', rt."description", 'images', rt."images", 'amenities', rt."amenities", 'rentMode', rt."rentMode") ORDER BY rt."sortOrder" ASC, rt."name" ASC)
                       FROM "HotelRoomType" rt WHERE rt."unitId" = u."id" AND rt."tenantId" = u."tenantId" AND rt."active" = true), '[]'::json) AS "types",
           COALESCE((SELECT json_agg(json_build_object('ratePlanId', cr."ratePlanId", 'daysBefore', cr."daysBefore", 'refundBp', cr."refundBp") ORDER BY cr."daysBefore" DESC)
                       FROM "HotelCancelRule" cr WHERE cr."unitId" = u."id" AND cr."tenantId" = u."tenantId"), '[]'::json) AS "rules",
           COALESCE((SELECT json_agg(json_build_object('id', r."id", 'roomTypeId', r."roomTypeId", 'active', r."active", 'status', r."status"::text, 'hkStatus', r."hkStatus", 'rentMode', r."rentMode", 'typeRentMode', rt2."rentMode"))
                       FROM "HotelRoom" r JOIN "HotelRoomType" rt2 ON rt2."id" = r."roomTypeId" AND rt2."active" = true
                      WHERE r."unitId" = u."id" AND r."tenantId" = u."tenantId"), '[]'::json) AS "rooms",
           COALESCE((SELECT json_agg(json_build_object('roomId', o."roomId", 'kind', o."kind", 'startDate', o."startDate", 'endDate', o."endDate"))
                       FROM "RoomOccupancy" o WHERE o."unitId" = u."id" AND o."tenantId" = u."tenantId" AND o."active" = true AND o."kind" IN ('BLOCK', 'LEASE') AND o."startDate" < ${e} AND o."endDate" > ${f}), '[]'::json) AS "occ",
           COALESCE((SELECT json_agg(json_build_object('roomTypeId', n."roomTypeId", 'date', n."date", 'n', n."c"))
                       FROM (SELECT bn."roomTypeId", bn."date", count(*)::int AS "c" FROM "HotelBookingNight" bn
                              WHERE bn."unitId" = u."id" AND bn."tenantId" = u."tenantId" AND bn."counted" = true AND bn."date" >= ${f} AND bn."date" < ${e}
                              GROUP BY bn."roomTypeId", bn."date") n), '[]'::json) AS "nights",
           ${guardSql}
      FROM "BusinessUnit" u JOIN "Tenant" t ON t."id" = u."tenantId"
     WHERE t."slug" = ${t} AND u."slug" = ${u} AND u."type"::text = 'HOTEL' AND t."status"::text = 'ACTIVE' AND u."status"::text IN ('ACTIVE', 'PAUSED')
     LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  const typeRows = (Array.isArray(r.types) ? r.types : []).filter(isRec);
  const types = typeRows.map(
    (x): WebRoomTypeInfo => ({
      id: String(x.id),
      name: String(x.name ?? ""),
      capacity: numOr(x.capacity, 2),
      baseOccupancy: numOr(x.baseOccupancy, 2),
      maxOccupancy: typeof x.maxOccupancy === "number" ? x.maxOccupancy : null,
      bedType: isStr(x.bedType) ? x.bedType : null,
      description: isStr(x.description) ? x.description : null,
      images: strArr(x.images),
      amenities: strArr(x.amenities, 40),
    }),
  );
  const rules = (Array.isArray(r.rules) ? r.rules : [])
    .filter(isRec)
    .filter((x) => isStr(x.ratePlanId) && Number.isInteger(x.daysBefore) && Number.isInteger(x.refundBp))
    .map((x) => ({ ratePlanId: String(x.ratePlanId), daysBefore: Number(x.daysBefore), refundBp: Number(x.refundBp) }));
  const ymd = (v: unknown) => String(v ?? "").slice(0, 10);
  const byDate = buildAvailability(
    typeRows.map((x) => ({ id: String(x.id), rentMode: isStr(x.rentMode) ? x.rentMode : "NIGHTLY" })),
    (Array.isArray(r.rooms) ? r.rooms : []).filter(isRec).map((x) => ({
      id: String(x.id),
      roomTypeId: String(x.roomTypeId),
      active: x.active === true,
      status: isStr(x.status) ? x.status : "AVAILABLE",
      hkStatus: isStr(x.hkStatus) ? x.hkStatus : "CLEAN",
      rentMode: isStr(x.rentMode) ? x.rentMode : null,
      typeRentMode: isStr(x.typeRentMode) ? x.typeRentMode : "NIGHTLY",
    })),
    (Array.isArray(r.occ) ? r.occ : []).filter(isRec).map((x) => ({ roomId: String(x.roomId), kind: String(x.kind), startDate: ymd(x.startDate), endDate: ymd(x.endDate) })),
    (Array.isArray(r.nights) ? r.nights : []).filter(isRec).map((x) => ({ roomTypeId: String(x.roomTypeId), date: ymd(x.date), n: numOr(x.n, 0) })),
    from,
    to,
  );
  const webHeld = (Array.isArray(r.held) ? r.held : []).filter(isRec).map((x) => ({ roomTypeId: String(x.roomTypeId), date: ymd(x.date), n: numOr(x.n, 0) }));
  return { tenantId: r.tenantId, tenantSlug: r.tenantSlug, tenantName: r.tenantName, unitId: r.unitId, unitSlug: r.unitSlug, unitName: r.unitName, unitStatus: r.unitStatus, roomTypes: types, cancelRules: rules, byDate, webHeld, clientHeld: numOr(r.clientHeld, 0) };
}

/**
 * SVC H.8 r2 ▸ จดเครื่องหมาย «การจองเหล่านี้ถือโดย client นี้» (ผู้ตรวจ A-6 ข) — แถว ChatRateBucket กุญแจ `<markPrefix><reservationId>` (count 1)
 * ใช้นับใน webSearchBundle(guard) เท่านั้น · แถวถูกกวาดตามรอบถัง rate (24 ชม.) · ล้ม = log ไม่ throw (ด่านเป็น «ของเสริม» ไม่ขวางการจองที่สร้างแล้ว)
 */
export async function webHoldMark(markPrefix: string, reservationIds: string[], now: Date = new Date()): Promise<void> {
  const ids = reservationIds.filter((x) => isStr(x) && x.length <= 64 && !x.includes(":"));
  if (!MARK_PREFIX_RE.test(markPrefix) || !ids.length) return;
  try {
    await raw().$executeRaw`
      INSERT INTO "ChatRateBucket" ("id", "key", "count", "windowStart", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, ${markPrefix} || x.rid, 1, ${now}, NOW(), NOW() FROM unnest(${ids}::text[]) AS x(rid)
      ON CONFLICT ("key") DO NOTHING`;
  } catch (e) {
    console.warn(`[hotel.web] จดเครื่องหมาย HOLD ไม่สำเร็จ (${e instanceof Error ? e.name : "Error"})`);
  }
}

export type WebPlanRow = { id: string; code: string; name: string; isDefault: boolean; visibility: string[] };
/** แผนราคา ACTIVE ของหน่วย (ด่าน visibility ตอนสร้าง HOLD) */
export async function webPlansOf(tenantId: string, unitId: string): Promise<WebPlanRow[]> {
  const rows = await tenantDb({ tenantId, unitId }).hotelRatePlan.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, code: true, name: true, isDefault: true, visibility: true },
  });
  return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, isDefault: p.isDefault, visibility: strArr(p.visibility) }));
}

/** กฎยกเลิกของแผน (เรียงวันมาก→น้อย) — ไม่มี = [] (ผู้เรียกใช้ค่าตั้ง rooms.hotel.cancelPolicy แทน) */
export async function planCancelRules(tenantId: string, unitId: string, ratePlanId: string): Promise<{ daysBefore: number; refundBp: number }[]> {
  if (!isStr(ratePlanId)) return [];
  return tenantDb({ tenantId, unitId }).hotelCancelRule.findMany({ where: { ratePlanId }, orderBy: { daysBefore: "desc" }, select: { daysBefore: true, refundBp: true } });
}

/** การจองจาก publicToken ในหน่วยนี้เท่านั้น (ร้าน/หน่วยอื่น = null) */
async function rowByToken(tenantId: string, unitId: string, publicToken: string) {
  const tok = (publicToken ?? "").trim();
  if (!tok || tok.length > 64) return null;
  return tenantDb({ tenantId, unitId }).hotelReservation.findFirst({ where: { publicToken: tok }, include: { roomType: { select: { name: true } } } });
}

export type WebSlipState = { id: string; status: string; createdAt: string } | null;
export type WebDepositMoney = { amountSatang: number; usedSatang: number; refundedSatang: number; remainingSatang: number; status: string } | null;
export type WebBookingFacts = {
  id: string;
  code: string;
  status: string;
  source: string;
  groupId: string | null;
  roomTypeId: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  checkInDate: Date;
  nights: number;
  adults: number;
  children: number;
  guestEmail: string | null;
  /** SVC H.8 r4 (ภาพ 16 ข กล่อง «ผู้เข้าพัก») ชื่อ/เบอร์ดิบ — ภายในเท่านั้น · ชั้นสาธารณะ (platform/hotel-web) ปิดบางส่วนก่อนส่ง */
  guestName: string;
  guestPhone: string | null;
  totalSatang: number;
  /** หัวกลุ่ม (ผู้ถือมัดจำ) */
  head: { id: string; depositSatang: number; depositPaidAt: Date | null; depositSaleId: string | null; policySnapshot: unknown; checkInDate: Date; status: string };
  /** ทุกแถวของกลุ่ม (เดี่ยว = แถวเดียว) */
  group: { id: string; code: string; status: string; roomTypeName: string; totalSatang: number }[];
  holdExpiresAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  policySnapshot: unknown;
  slip: WebSlipState;
  /** SVC H.8 r2 (A-13) สลิปที่ยังรอตรวจ (PENDING/NEEDS_REVIEW) ของกลุ่มนี้ — มีได้ใบเดียว */
  pendingSlip: WebSlipState;
  money: WebDepositMoney;
};

/** มัดจำตามจริงใน POS (ใบรับของหัวกลุ่ม) — ไม่มี POS/ไม่มีใบรับ = null */
async function depositMoney(tenantId: string, unitId: string, receiptSaleId: string | null): Promise<WebDepositMoney> {
  if (!receiptSaleId) return null;
  const systemId = await systemForUnit(tenantId, unitId, "POS");
  if (!systemId) return null;
  const d = await tenantDb({ tenantId, systemId }).posDeposit.findFirst({ where: { receiptSaleId }, select: { unitId: true, status: true, amountSatang: true, usedSatang: true, refundedSatang: true } });
  if (!d || d.unitId !== unitId) return null;
  const status = String(d.status);
  return { amountSatang: d.amountSatang, usedSatang: d.usedSatang, refundedSatang: d.refundedSatang, remainingSatang: status === "OPEN" ? Math.max(0, d.amountSatang - d.usedSatang - d.refundedSatang) : 0, status };
}

/** ข้อเท็จจริงของการจองสำหรับหน้าสถานะ/ยกเลิก (token ของหน่วยนี้เท่านั้น) */
export async function webBookingFacts(tenantId: string, unitId: string, publicToken: string): Promise<WebBookingFacts | null> {
  const rv = await rowByToken(tenantId, unitId, publicToken);
  if (!rv) return null;
  const db = tenantDb({ tenantId, unitId });
  const group = rv.groupId
    ? await db.hotelReservation.findMany({ where: { groupId: rv.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }], include: { roomType: { select: { name: true } } } })
    : [rv];
  const head = group.find((r) => r.depositPaidAt) ?? group.find((r) => r.depositSatang > 0) ?? group[0] ?? rv;
  const slips = await db.paymentSlip.findMany({ where: { domain: "HOTEL", refType: "HOTEL_DEPOSIT", refId: { in: group.map((r) => r.id) } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, createdAt: true } });
  const s = slips[0];
  const pend = slips.find((x) => x.status === "PENDING" || x.status === "NEEDS_REVIEW");
  return {
    id: rv.id,
    code: rv.code,
    status: rv.status,
    source: rv.source,
    groupId: rv.groupId,
    roomTypeId: rv.roomTypeId,
    roomTypeName: rv.roomType.name,
    checkIn: ymdOfDb(rv.checkInDate),
    checkOut: ymdOfDb(rv.checkOutDate),
    checkInDate: rv.checkInDate,
    nights: rv.nights,
    adults: rv.adults,
    children: rv.children,
    guestEmail: rv.guestEmail,
    guestName: rv.guestName,
    guestPhone: rv.guestPhone,
    totalSatang: rv.totalSatang,
    head: { id: head.id, depositSatang: head.depositSatang, depositPaidAt: head.depositPaidAt, depositSaleId: head.depositSaleId, policySnapshot: head.policySnapshot, checkInDate: head.checkInDate, status: head.status },
    group: group.map((r) => ({ id: r.id, code: r.code, status: r.status, roomTypeName: r.roomType.name, totalSatang: r.totalSatang })),
    holdExpiresAt: rv.holdExpiresAt,
    cancelledAt: rv.cancelledAt,
    cancelReason: rv.cancelReason,
    policySnapshot: rv.policySnapshot,
    slip: s ? { id: s.id, status: s.status, createdAt: s.createdAt.toISOString() } : null,
    pendingSlip: pend ? { id: pend.id, status: pend.status, createdAt: pend.createdAt.toISOString() } : null,
    money: head.depositPaidAt ? await depositMoney(tenantId, unitId, head.depositSaleId) : null,
  };
}

/**
 * lookup ด้วยรหัสการจอง (ตัวพิมพ์ใหญ่) ในหน่วยนี้ — คืน token + อีเมลให้ผู้เรียกเทียบเอง (คิวรีเดียวทุกกรณี · เวลาตอบเท่ากันทั้ง "ไม่มีรหัส" และ "อีเมลผิด")
 * 🔴 ผู้เรียกห้ามส่งต่อค่าใดถ้าอีเมลไม่ตรง
 */
export async function webBookingByCode(tenantId: string, unitId: string, code: string): Promise<{ publicToken: string | null; guestEmail: string | null } | null> {
  const c = (code ?? "").trim().toUpperCase();
  const r = await tenantDb({ tenantId, unitId }).hotelReservation.findFirst({ where: { code: c.length >= 3 && c.length <= 40 ? c : "\u0000" }, select: { publicToken: true, guestEmail: true } });
  return r ?? null;
}

/** ใบเดิมของคำขอเว็บซ้ำ (กุญแจที่ผู้เรียก hash แล้ว · ตรงกับ policySnapshot.webIdem ที่ createBooking จด) */
export async function webBookingByIdem(tenantId: string, unitId: string, idem: string) {
  if (!isStr(idem)) return null;
  const rv = await tenantDb({ tenantId, unitId }).hotelReservation.findFirst({
    where: { source: { in: ["WEB", "LINE"] }, policySnapshot: { path: ["webIdem"], equals: idem } },
    orderBy: [{ createdAt: "asc" }, { code: "asc" }],
    select: { id: true, code: true, status: true, publicToken: true, groupId: true, holdExpiresAt: true, depositSatang: true, checkInDate: true, checkOutDate: true, guestName: true, guestEmail: true, guestPhone: true, roomTypeId: true, ratePlanId: true },
  });
  if (!rv) return null;
  const { checkInDate, checkOutDate, guestName, guestEmail, guestPhone, roomTypeId, ratePlanId, ...head } = rv;
  // SVC H.8 r2 ▸ ลายนิ้วมือคำขอเดิม (ผู้เรียกเทียบกับคำขอซ้ำ ⇒ ธง mismatch · ไม่ส่งออกสาธารณะ) ◂
  const fp = (types: string[]) => ({ checkIn: ymdOfDb(checkInDate), checkOut: ymdOfDb(checkOutDate), guestName, guestEmail, guestPhone, ratePlanId, roomTypeIds: [...types].sort() });
  if (!rv.groupId) return { ...head, depositRequiredSatang: rv.depositSatang, fingerprint: fp([roomTypeId]) };
  const all = await tenantDb({ tenantId, unitId }).hotelReservation.findMany({ where: { groupId: rv.groupId }, select: { depositSatang: true, roomTypeId: true } });
  return { ...head, depositRequiredSatang: all.reduce((a, r) => a + r.depositSatang, 0), fingerprint: fp(all.map((r) => r.roomTypeId)) };
}

/** สลิปมัดจำโรงแรม (สถานะอนุมัติแล้ว) + การจองหัวที่อ้าง — ข้อมูลของ consumer `payment.slip.approved` สาขา HOTEL · ไม่ใช่ของร้านนี้/ไม่ใช่ HOTEL = null */
export async function hotelDepositSlipFacts(tenantId: string, slipId: string) {
  if (!isStr(tenantId) || !isStr(slipId) || slipId.length > 64) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; unitId: string; domain: string; refType: string; refId: string; status: string; amountSatang: number | null; expectedSatang: number; checks: unknown }[]>`
    SELECT "id", "unitId", "domain", "refType", "refId", "status", "amountSatang", "expectedSatang", "checks"
      FROM "PaymentSlip" WHERE "tenantId" = ${tenantId} AND "id" = ${slipId} LIMIT 1`;
  const s = rows[0];
  if (!s || s.domain !== "HOTEL" || s.refType !== "HOTEL_DEPOSIT" || (s.status !== "APPROVED" && s.status !== "AUTO_APPROVED")) return null;
  const rv = await tenantDb({ tenantId, unitId: s.unitId }).hotelReservation.findFirst({ where: { id: s.refId }, select: { id: true, code: true, groupId: true } });
  if (!rv) return null;
  const decided = isRec(s.checks) && isRec(s.checks.decided) ? s.checks.decided.amountSatang : undefined;
  const pick = [decided, s.amountSatang, s.expectedSatang].find((v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0);
  // สลิปนี้ลงเงินไปแล้ว (มีแถวรับเงินใน POS อ้าง slip:<id> — ทั้งที่ยืนยันแล้วหรือถูกคืนอัตโนมัติ) ⇒ ผู้เรียกไม่ทำซ้ำ (X4 · กันใบรับ/ใบคืนเบิ้ลเมื่อ event ถูกส่งซ้ำ)
  const paidRows = await tenantDb({ tenantId }).$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "PosPayment" p JOIN "PosSale" ps ON ps."id" = p."saleId" WHERE ps."tenantId" = ${tenantId} AND p."reference" = ${`slip:${s.id}`}`;
  return { slipId: s.id, unitId: s.unitId, reservationId: rv.id, groupId: rv.groupId, code: rv.code, amountSatang: typeof pick === "number" ? pick : 0, settled: (paidRows[0]?.n ?? 0) > 0 };
}

/** สลิปของคำขอแนบซ้ำ (กุญแจเดียวกับที่ slip-verify จดใน checks.idempotencyKey · ดัชนีนิพจน์ของ svc_d) */
export async function slipByIdemKey(tenantId: string, unitId: string, key: string): Promise<{ id: string; status: string; refId: string } | null> {
  if (!isStr(key) || key.length > 128) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; status: string; refId: string; unitId: string }[]>`
    SELECT "id", "status", "refId", "unitId" FROM "PaymentSlip" WHERE "tenantId" = ${tenantId} AND ("checks"->>'idempotencyKey') = ${key} LIMIT 1`;
  const r = rows[0];
  return r && r.unitId === unitId ? { id: r.id, status: r.status, refId: r.refId } : null;
}

/** basicId ของ LINE OA (ChatChannelConnection ของร้านนี้ · ชนิด LINE) — ไม่มี/รูปผิด = null */
export async function lineOaBasicId(tenantId: string, connectionId: string): Promise<string | null> {
  if (!isStr(connectionId) || connectionId.length > 64) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<{ meta: unknown }[]>`
    SELECT "meta" FROM "ChatChannelConnection" WHERE "tenantId" = ${tenantId} AND "id" = ${connectionId} AND "type"::text = 'LINE' LIMIT 1`;
  const b = isRec(rows[0]?.meta) ? (rows[0]?.meta as Record<string, unknown>).basicId : null;
  return typeof b === "string" && /^@[A-Za-z0-9._-]{1,40}$/.test(b) ? b : null;
}

export type GuestMailFacts = {
  id: string;
  tenantId: string;
  unitId: string;
  tenantSlug: string;
  unitSlug: string;
  unitName: string;
  code: string;
  status: string;
  source: string;
  groupId: string | null;
  isGroupHead: boolean;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  rooms: number;
  guestEmail: string | null;
  totalSatang: number;
  depositSatang: number;
  depositPaid: boolean;
  holdExpiresAt: Date | null;
  publicToken: string | null;
  locale: string | null;
  bookingMode: string | null;
  refundedSatang: number;
};

/** ข้อเท็จจริงของอีเมลแจ้งแขก (id การจองล้วน · ข้ามร้านได้ — ผู้เรียก = consumer/งานเตือนของระบบ) · ไม่พบ = null */
export async function guestMailFacts(reservationId: string): Promise<GuestMailFacts | null> {
  if (!isStr(reservationId) || reservationId.length > 64) return null;
  const rows = await raw().$queryRaw<{ id: string; tenantId: string; unitId: string; unitName: string; unitSlug: string; tenantSlug: string }[]>`
    SELECT r."id", r."tenantId", r."unitId", u."name" AS "unitName", u."slug" AS "unitSlug", t."slug" AS "tenantSlug"
      FROM "HotelReservation" r JOIN "BusinessUnit" u ON u."id" = r."unitId" AND u."tenantId" = r."tenantId" JOIN "Tenant" t ON t."id" = r."tenantId"
     WHERE r."id" = ${reservationId} LIMIT 1`;
  const k = rows[0];
  if (!k) return null;
  const db = tenantDb({ tenantId: k.tenantId, unitId: k.unitId });
  const rv = await db.hotelReservation.findFirst({ where: { id: k.id }, include: { roomType: { select: { name: true } } } });
  if (!rv) return null;
  const group = rv.groupId ? await db.hotelReservation.findMany({ where: { groupId: rv.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }], select: { id: true, totalSatang: true, depositSatang: true, depositPaidAt: true, depositSaleId: true } }) : null;
  const head = group ? (group.find((r) => r.depositPaidAt) ?? group.find((r) => r.depositSatang > 0) ?? group[0]) : null;
  const paidHead = head ?? { depositSatang: rv.depositSatang, depositPaidAt: rv.depositPaidAt, depositSaleId: rv.depositSaleId };
  const money = paidHead.depositPaidAt ? await depositMoney(k.tenantId, k.unitId, paidHead.depositSaleId) : null;
  const snap = isRec(rv.policySnapshot) ? rv.policySnapshot : null;
  return {
    id: rv.id,
    tenantId: k.tenantId,
    unitId: k.unitId,
    tenantSlug: k.tenantSlug,
    unitSlug: k.unitSlug,
    unitName: k.unitName,
    code: rv.code,
    status: rv.status,
    source: rv.source,
    groupId: rv.groupId,
    isGroupHead: !group || group[0]?.id === rv.id,
    roomTypeName: rv.roomType.name,
    checkIn: ymdOfDb(rv.checkInDate),
    checkOut: ymdOfDb(rv.checkOutDate),
    nights: rv.nights,
    adults: rv.adults,
    rooms: group ? group.length : 1,
    guestEmail: rv.guestEmail,
    totalSatang: group ? group.reduce((a, r) => a + r.totalSatang, 0) : rv.totalSatang,
    depositSatang: paidHead.depositSatang,
    depositPaid: !!paidHead.depositPaidAt,
    holdExpiresAt: rv.holdExpiresAt,
    publicToken: rv.publicToken,
    locale: typeof snap?.locale === "string" ? snap.locale : null,
    bookingMode: typeof snap?.bookingMode === "string" ? snap.bookingMode : null,
    refundedSatang: money?.refundedSatang ?? 0,
  };
}

/** การจอง CONFIRMED ที่เข้าพักวันที่ ymd และมีอีเมล (ทุกร้าน · งานเตือนก่อนเข้า 1 วัน · กลุ่มหลายห้อง = หัวกลุ่มแถวเดียว) — id ล้วน */
export async function arrivalsWithEmailOn(ymd: string, limit = 500): Promise<{ id: string; tenantId: string; unitId: string }[]> {
  return raw().$queryRaw<{ id: string; tenantId: string; unitId: string }[]>`
    SELECT r."id", r."tenantId", r."unitId" FROM "HotelReservation" r
     WHERE r."status"::text = 'CONFIRMED' AND r."checkInDate" = ${dbDate(ymd)} AND r."guestEmail" IS NOT NULL AND r."guestEmail" <> ''
       AND (r."groupId" IS NULL OR r."id" = (SELECT g."id" FROM "HotelReservation" g WHERE g."groupId" = r."groupId" AND g."tenantId" = r."tenantId" ORDER BY g."createdAt" ASC, g."code" ASC LIMIT 1))
     ORDER BY r."id" ASC LIMIT ${limit}`;
}
