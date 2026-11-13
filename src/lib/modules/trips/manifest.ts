// ─────────────────────────────────────────────────────────────
// trips/manifest.ts — ใบรายชื่อรายวันของรอบ ฝั่งร้าน (ภาพ 12 ส่วนจอใหญ่ · RUN TRIPS T1.4a §4 §6)
//   loadManifestVM (อ่านอย่างเดียว) · exportManifestCsv · revealManifestHealth · recordManifestPrint (เขียนเฉพาะแถว AuditLog)
// ด่าน: zod strict (INVALID_INPUT) → หน่วย (NOT_FOUND/UNIT_NOT_TRIPS) → สิทธิ์ trips.departure.view ∧ trips.passenger.view (FORBIDDEN) → รอบของหน่วยนี้ (NOT_FOUND)
// 🔴 ตัวโหลดไม่เขียนฐาน · ไม่เปิดกล่องสุขภาพ · ไม่อ่านเลขเอกสารที่เข้ารหัส (เลือกเฉพาะ 4 ตัวท้าย) · เลขเอกสารปิดบังเสมอ (ค่าตั้งปิดบังบนจอไม่มีผลกับใบนี้)
// 🔴 ไม่เขียน/ลบตาราง Trip* · ไม่ส่ง event · ข้อมูลส่วนบุคคลไม่อยู่ใน audit/ops/ข้อความผิดพลาด (audit = รหัส · ค่าคงที่ · จำนวน เท่านั้น)
// 🔴 ทุกคิวรีผูก (tenantId, unitId) จากด่าน · อ่านเป็นชุดครั้งเดียวต่อจอ (ไม่มีคิวรีต่อแถว) · เพดานอยู่ใน SQL · ยอดรวมมาจากคิวรีรวมทั้งชุด (ไม่นับจากแถวที่ถูกตัด)
// 🔴 สถานะรายคน (แบบฟอร์ม · ลงนาม · สุขภาพ · ช่องที่ขาด) ใช้ตัวช่วยของ T0.8 ตัวเดียวกับ getTripPassengers — ไม่เขียนสูตรซ้ำ
// 🔴 เนื้อหาสุขภาพออกได้ทางเดียว: revealManifestHealth (สิทธิ์ trips.passenger.health ตรงตัว + แถว audit ต่อผู้เดินทาง commit ก่อนคืนค่า · กล่องใดเปิดไม่ได้ ⇒ BUSY ทั้งคำขอ)
// SQL ดิบ (อ่านอย่างเดียว): ข้อความคำสั่งมาจากค่าคงที่ในไฟล์นี้ · ค่าทุกตัวผูกเป็นพารามิเตอร์ ($n)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { listBriefsByIds } from "@/lib/modules/party";
import enMessages from "@/messages/en/trips.json";
import thMessages from "@/messages/th/trips.json";
import { BOOKING_OWES_STATUSES, maskPhone } from "./booking-view-core";
import { hhmm, normalizeTimezone, utcToLocal } from "./departures-core";
import {
  MANIFEST_BOOKING_STATUSES,
  MANIFEST_CSV_COLUMNS,
  MANIFEST_HEALTH_PURPOSES,
  MANIFEST_VIEWS,
  TRIPS_MANIFEST_BOOKING_CAP,
  TRIPS_MANIFEST_PAX_CAP,
  manifestCsv,
  manifestDocState,
  manifestFileName,
  parseRunStops,
  type ManifestExtraQty,
  type ManifestGroupVM,
  type ManifestHealthPurpose,
  type ManifestPaxQty,
  type ManifestPaxVM,
  type ManifestRowVM,
  type ManifestVM,
  type ManifestView,
  type RunStop,
} from "./manifest-core";
import { PENDING_OBJ_SQL, auditTx, inTx, isFailure, loadCfg, openHealth, safely, valuesOf, type Cfg, type PaxRow, type Unit } from "./passengers";
import { canSeeSensitive, healthViewOf, isPurgedAll, maskDoc, missingFields, parseAnswers, waiverStatusOf } from "./passengers-core";
import { tripsFail, tripsUnitGate, type TripsFail, type TripsScreenCtx, type TripsUnitGate } from "./pickup";

type Opts = { now?: Date };
type Fail = TripsFail<string>;
type Ok<T> = { ok: true; value: T };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFail = (x: unknown): x is TripsFail => isRec(x) && x.ok === false;
/** อักขระควบคุม (รวม NUL) — ค่าที่มี ⇒ INVALID_INPUT ไม่ปล่อยถึงคิวรี */
const CTL_RE = /[\u0000-\u001f\u007f]/;
const ID = z.string().min(1).max(128).refine((s) => !CTL_RE.test(s));
const nowOf = (opts?: Opts) => (opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date());
const i18nTh = (v: unknown): string => (isRec(v) && typeof v.th === "string" ? v.th : "");
const i18nEn = (v: unknown): string | null => (isRec(v) && typeof v.en === "string" && v.en.trim() ? v.en : null);
const DAY_MS = 86_400_000;

const DEP_VIEW = "trips.departure.view";
const PAX_VIEW = "trips.passenger.view";
const BOOKING_VIEW = "trips.booking.view";
const HEALTH_KEY = "trips.passenger.health";
const A_EXPORTED = "trips.manifest.exported";
const A_PRINTED = "trips.manifest.printed";
/** ชื่อเดียวกับการเปิดดูรายคนของ T0.8 — บันทึกการเข้าถึงรายบุคคลอยู่ที่เดียว */
const A_REVEALED = "trips.passenger.revealed";
const M_STATUSES: string[] = [...MANIFEST_BOOKING_STATUSES];
const OWES: string[] = [...BOOKING_OWES_STATUSES];
const PENDING_STATUSES = ["HOLD", "PENDING"];
const FORM_DONE = ["SUBMITTED", "VERIFIED"];
/** รถของรอบสูงสุดที่อ่าน */
const RUN_CAP = 50;
/** ทรัพยากรที่มอบให้รอบสูงสุดที่อ่าน */
const RESOURCE_USE_CAP = 100;
/** ประเภทคนของสินค้าสูงสุดที่อ่าน */
const PAX_TYPE_CAP = 50;
/** กลุ่มรายการ (ประเภทคน/รายการเสริม) สูงสุดของยอดรวมทั้งชุด */
const ITEM_GROUP_CAP = 300;
/** รายการของการจองที่แสดงสูงสุดที่อ่าน */
const ITEM_ROW_CAP = TRIPS_MANIFEST_BOOKING_CAP * 40;

const MSG: Record<string, string> = {
  BUSY: "เปิดข้อมูลนี้ไม่ได้ชั่วคราว — ลองอีกครั้ง",
  VALIDATION: "ค่าตั้งของหน่วยไม่ถูกต้อง กรุณาตรวจค่าตั้งทัวร์ก่อน",
};
const fail = (code: string): Fail => tripsFail(code, MSG[code]);

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> | Fail {
  const r = schema.safeParse(input);
  return r.success ? r.data : tripsFail("INVALID_INPUT");
}
const LOAD_IN = z.strictObject({ unitId: ID, departureId: ID, view: z.enum(MANIFEST_VIEWS).optional() });
const EXPORT_IN = z.strictObject({ unitId: ID, departureId: ID, locale: z.enum(["th", "en"]).optional() });
const REVEAL_IN = z.strictObject({ unitId: ID, departureId: ID, purpose: z.enum(MANIFEST_HEALTH_PURPOSES) });
const PRINT_IN = z.strictObject({ unitId: ID, departureId: ID });

// ═══════════════ ด่าน + รอบ ═══════════════
type DepRow = { id: string; productId: string; optionId: string | null; localDate: Date; startsAt: Date; endsAt: Date; status: string; capacity: number; sold: number };
type Entered = { g: TripsUnitGate; u: Unit; dep: DepRow; localDate: string };
/** หน่วย → สิทธิ์ดูรอบ ∧ ดูผู้เดินทาง → เขตเวลาของหน่วย → รอบของหน่วยนี้ */
async function enter(ctx: TripsScreenCtx, unitId: string, departureId: string): Promise<Entered | Fail> {
  const g = await tripsUnitGate(ctx, { unitId });
  if (isFail(g)) return g;
  if (!g.can(DEP_VIEW) || !g.can(PAX_VIEW)) return tripsFail("FORBIDDEN");
  const scope = { tenantId: g.tenantId, unitId: g.unitId };
  const [unit, dep] = await Promise.all([
    tenantDb({ tenantId: g.tenantId }).businessUnit.findFirst({ where: { id: g.unitId, tenantId: g.tenantId }, select: { settings: true } }),
    g.db.tripDeparture.findFirst({ where: { ...scope, id: departureId }, select: { id: true, productId: true, optionId: true, localDate: true, startsAt: true, endsAt: true, status: true, capacity: true, sold: true } }),
  ]);
  if (!dep) return tripsFail("NOT_FOUND");
  const tz = normalizeTimezone(isRec(unit?.settings) ? unit.settings.timezone : null);
  return { g, u: { tenantId: g.tenantId, unitId: g.unitId, tz }, dep, localDate: new Date(dep.localDate).toISOString().slice(0, 10) };
}
/** "08:00–16:30" ตามเวลาร้าน · จบคนละวัน ⇒ ต่อท้าย " (+N)" (แบบจอปฏิทินรอบ/จอการจอง) */
function timeTextOf(tz: string, startsAt: Date, endsAt: Date): string {
  const s = utcToLocal(tz, new Date(startsAt));
  const e = utcToLocal(tz, new Date(endsAt));
  const days = Math.round((Date.parse(`${e.ymd}T00:00:00.000Z`) - Date.parse(`${s.ymd}T00:00:00.000Z`)) / DAY_MS);
  return `${hhmm(s.minutes)}–${hhmm(e.minutes)}${days > 0 ? ` (+${days})` : ""}`;
}

// ═══════════════ SQL ของชุดการจอง M (ร้าน + หน่วย + รอบ + สถานะที่ขึ้นใบ) ═══════════════
/** เงื่อนไขของชุด M บน alias b — พารามิเตอร์ $1 ร้าน · $2 หน่วย · $3 รอบ · $4 สถานะ */
const M_WHERE = `b."tenantId" = $1 AND b."unitId" = $2 AND b."departureId" = $3 AND b."status" = ANY($4::text[])`;
/** ผู้เดินทางที่ถูกลบทั้งแถว (นิยามเดียวกับ isPurgedAll ของ T0.8: purged.at เป็นข้อความ ∧ purged.stages มี "ALL") */
const PURGED_SQL = `COALESCE(jsonb_typeof(p."answers"->'purged'->'at') = 'string' AND jsonb_typeof(p."answers"->'purged'->'stages') = 'array' AND jsonb_exists(p."answers"->'purged'->'stages', 'ALL'), false)`;
const PAX_AGG_COLS = `count(*)::int AS "slots",
  count(*) FILTER (WHERE ${PURGED_SQL})::int AS "purged",
  count(*) FILTER (WHERE btrim(p."fullName") <> '' AND NOT ${PURGED_SQL})::int AS "named",
  count(*) FILTER (WHERE p."formStatus" = ANY($5::text[]) AND NOT ${PURGED_SQL})::int AS "formComplete",
  count(*) FILTER (WHERE p."formStatus" = 'NEEDS_FIX' AND NOT ${PURGED_SQL})::int AS "needsFix"`;
const PAX_JOIN = `FROM "TripPassenger" p JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId" AND b."unitId" = p."unitId"`;
type PaxAgg = { slots: number; purged: number; named: number; formComplete: number; needsFix: number };
const ZERO_AGG: PaxAgg = { slots: 0, purged: 0, named: 0, formComplete: 0, needsFix: 0 };
const mArgs = (e: Entered): unknown[] => [e.g.tenantId, e.g.unitId, e.dep.id, M_STATUSES];
/** ยอดรวมผู้เดินทางทั้งชุด M (แถวเดียว) */
async function paxAggOfM(e: Entered): Promise<PaxAgg> {
  const rows = await e.g.db.$queryRawUnsafe<PaxAgg[]>(`SELECT ${PAX_AGG_COLS} ${PAX_JOIN} WHERE p."tenantId" = $1 AND p."unitId" = $2 AND ${M_WHERE}`, ...mArgs(e), FORM_DONE);
  return rows[0] ?? ZERO_AGG;
}

type BookingRow = {
  id: string;
  code: string;
  status: string;
  bookerPartyId: string | null;
  piiPurgedAt: Date | null;
  channel: string;
  agentAccountId: string | null;
  agentRef: string | null;
  contactRoute: string;
  grossSatang: number;
  discountSatang: number;
  agentDiscountSatang: number;
  paidSatang: number;
};
type ItemRow = { id: string; bookingId: string; kind: string; paxTypeId: string | null; extraId: string | null; qty: number; passThrough: boolean };
type PaxSelect = Omit<PaxRow, "docNumberEnc" | "guardianConsent" | "retainUntil" | "checkinAt" | "bookingStatus" | "piiPurgedAt" | "bookingCreatedAt" | "productId" | "departureId" | "localDate" | "startsAt" | "endsAt" | "crossBorder" | "deepDive" | "title">;
/** คอลัมน์ผู้เดินทางที่ใบรายชื่ออ่าน — ไม่มีเลขเอกสารที่เข้ารหัส · ไม่มีข้อมูลผู้ปกครอง */
const PAX_SELECT = `p."id", p."unitId", p."bookingId", p."itemId", p."createdAt", p."fullName", p."nationality", p."dob", p."sex", p."docType", p."docLast4", p."docExpiry", p."phone", p."birthPlace",
  p."certLevel", p."diveCount", p."lastDiveAt", p."isMinor", p."answers", p."formStatus", p."waiverSignedAt", p."waiverEvidence"`;

// ═══════════════ ตัวโหลด ═══════════════
type Loaded = { vm: ManifestVM };
/** แกนของตัวโหลด/ส่งออก — อ่านเป็นชุด 3 รอบ (ไม่มีคิวรีต่อแถว) แล้วประกอบ VM */
async function build(e: Entered, view: ManifestView, now: Date): Promise<Loaded | Fail> {
  const { g, u, dep } = e;
  const scope = { tenantId: g.tenantId, unitId: g.unitId };
  const canSeeMoney = g.can(BOOKING_VIEW);
  const canSeeHealth = canSeeSensitive(g.member, HEALTH_KEY, g.unitId);

  // ── รอบ 1: สินค้า · การจองที่แสดง (เพดานใน SQL) · ยอดรวมทั้งชุด · รถ · ทรัพยากรของรอบ ──
  const [product, option, bookings, bookingAgg, pendingBookings, itemAgg, paxTypes, runs, uses, paxAll] = await Promise.all([
    g.db.tripProduct.findFirst({ where: { ...scope, id: dep.productId }, select: { id: true, title: true, crossBorder: true, deepDive: true } }),
    dep.optionId ? g.db.tripOption.findFirst({ where: { ...scope, id: dep.optionId }, select: { name: true } }) : Promise.resolve(null),
    g.db.$queryRawUnsafe<BookingRow[]>(
      `SELECT b."id", b."code", b."status", b."bookerPartyId", b."piiPurgedAt", b."channel", b."agentAccountId", b."agentRef", b."contactRoute", b."grossSatang", b."discountSatang", b."agentDiscountSatang", b."paidSatang"
       FROM "TripBooking" b WHERE ${M_WHERE} ORDER BY b."code" ASC, b."id" ASC LIMIT $5::int`,
      ...mArgs(e),
      TRIPS_MANIFEST_BOOKING_CAP,
    ),
    g.db.$queryRawUnsafe<{ n: number; outstanding: bigint | number; agentCollect: number }[]>(
      `SELECT count(*)::int AS "n",
         COALESCE(sum(CASE WHEN b."status" = ANY($5::text[]) THEN GREATEST(0, b."grossSatang" - b."discountSatang" - b."agentDiscountSatang" - b."paidSatang") ELSE 0 END), 0) AS "outstanding",
         count(*) FILTER (WHERE b."collectMode" = 'AGENT' OR b."agentAccountId" IS NOT NULL)::int AS "agentCollect"
       FROM "TripBooking" b WHERE ${M_WHERE}`,
      ...mArgs(e),
      OWES,
    ),
    g.db.tripBooking.count({ where: { ...scope, departureId: dep.id, status: { in: PENDING_STATUSES } } }),
    g.db.$queryRawUnsafe<{ kind: string; paxTypeId: string | null; extraId: string | null; qty: number }[]>(
      `SELECT i."kind", i."paxTypeId", i."extraId", sum(i."qty")::int AS "qty"
       FROM "TripBookingItem" i JOIN "TripBooking" b ON b."id" = i."bookingId" AND b."tenantId" = i."tenantId" AND b."unitId" = i."unitId"
       WHERE i."tenantId" = $1 AND i."unitId" = $2 AND ${M_WHERE} AND i."active" = true AND (i."kind" = 'SEAT' OR (i."kind" = 'EXTRA' AND i."passThrough" = false))
       GROUP BY i."kind", i."paxTypeId", i."extraId" ORDER BY i."kind", i."paxTypeId", i."extraId" LIMIT $5::int`,
      ...mArgs(e),
      ITEM_GROUP_CAP,
    ),
    g.db.tripPaxType.findMany({ where: { ...scope, productId: dep.productId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], take: PAX_TYPE_CAP, select: { id: true, code: true, label: true, sortOrder: true } }),
    g.db.tripVehicleRun.findMany({ where: { ...scope, departureId: dep.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: RUN_CAP, select: { id: true, resourceId: true, stops: true, createdAt: true } }),
    g.db.tripResourceUse.findMany({ where: { ...scope, departureId: dep.id, active: true }, orderBy: [{ id: "asc" }], take: RESOURCE_USE_CAP, select: { resourceId: true } }),
    paxAggOfM(e),
  ]);
  if (!product) return tripsFail("NOT_FOUND");

  const ids = bookings.map((b) => b.id);
  const shown = new Set(ids);
  const bookingsTotal = bookingAgg[0]?.n ?? 0;
  const truncated = bookingsTotal > bookings.length;
  const parsedRuns = runs.map((r) => ({ id: r.id, resourceId: r.resourceId, createdAt: r.createdAt, stops: parseRunStops(r.stops) }));
  /** การจองที่ stop อ้างถึงแต่ไม่อยู่ในชุดที่แสดง — ตรวจกับชุด M ทั้งชุดเฉพาะเมื่อรายการถูกตัด (ไม่งั้นจะนับเป็นจุดรับค้างผิด) */
  const offPage = truncated ? [...new Set(parsedRuns.flatMap((r) => r.stops.map((s) => s.bookingId)).filter((id) => !shown.has(id)))] : [];
  const extraIds = [...new Set(itemAgg.filter((i) => i.kind === "EXTRA" && i.extraId).map((i) => String(i.extraId)))];
  const resourceIds = [...new Set([...parsedRuns.map((r) => r.resourceId), ...uses.map((x) => x.resourceId)])];
  const partyIds = [...new Set(bookings.filter((b) => b.piiPurgedAt === null && b.bookerPartyId).map((b) => String(b.bookerPartyId)))];

  // ── รอบ 2: ของการจองที่แสดง (รายการ · ผู้เดินทาง · ยอดต่อการจอง) + ชื่อ/ทรัพยากร/ค่าตั้งแบบฟอร์ม ──
  const [cfg, items, paxRows, paxCount, perBooking, briefs, extras, resources, inM] = await Promise.all([
    loadCfg(u, { productId: product.id, crossBorder: product.crossBorder, deepDive: product.deepDive }, now),
    ids.length
      ? g.db.tripBookingItem.findMany({ where: { ...scope, bookingId: { in: ids }, active: true }, orderBy: [{ id: "asc" }], take: ITEM_ROW_CAP, select: { id: true, bookingId: true, kind: true, paxTypeId: true, extraId: true, qty: true, passThrough: true } })
      : Promise.resolve<ItemRow[]>([]),
    ids.length
      ? g.db.$queryRawUnsafe<PaxSelect[]>(
          `SELECT ${PAX_SELECT} ${PAX_JOIN} WHERE p."tenantId" = $1 AND p."unitId" = $2 AND p."bookingId" = ANY($3::text[]) ORDER BY b."code" ASC, b."id" ASC, p."createdAt" ASC, p."id" ASC LIMIT $4::int`,
          g.tenantId,
          g.unitId,
          ids,
          TRIPS_MANIFEST_PAX_CAP,
        )
      : Promise.resolve<PaxSelect[]>([]),
    ids.length ? g.db.tripPassenger.count({ where: { ...scope, bookingId: { in: ids } } }) : Promise.resolve(0),
    ids.length
      ? g.db.$queryRawUnsafe<(PaxAgg & { bookingId: string })[]>(
          `SELECT p."bookingId", ${PAX_AGG_COLS} ${PAX_JOIN} WHERE p."tenantId" = $1 AND p."unitId" = $2 AND ${M_WHERE} AND p."bookingId" = ANY($6::text[]) GROUP BY p."bookingId" LIMIT $7::int`,
          ...mArgs(e),
          FORM_DONE,
          ids,
          TRIPS_MANIFEST_BOOKING_CAP,
        )
      : Promise.resolve<(PaxAgg & { bookingId: string })[]>([]),
    listBriefsByIds(g.tenantId, partyIds),
    extraIds.length ? g.db.tripExtra.findMany({ where: { ...scope, id: { in: extraIds } }, take: ITEM_GROUP_CAP, select: { id: true, name: true } }) : Promise.resolve([]),
    resourceIds.length ? g.db.tripResource.findMany({ where: { ...scope, id: { in: resourceIds } }, take: RUN_CAP + RESOURCE_USE_CAP, select: { id: true, kind: true, name: true, seats: true } }) : Promise.resolve([]),
    offPage.length
      ? g.db.$queryRawUnsafe<{ id: string }[]>(`SELECT b."id" FROM "TripBooking" b WHERE ${M_WHERE} AND b."id" = ANY($5::text[]) LIMIT $6::int`, ...mArgs(e), offPage, offPage.length)
      : Promise.resolve<{ id: string }[]>([]),
  ]);
  if (isFailure(cfg)) return fail("VALIDATION");
  const paxIds = paxRows.map((p) => p.id);

  // ── รอบ 3: จำนวนไฟล์ต่อผู้เดินทาง (นับเท่านั้น — ไม่อ่านรหัสไฟล์) · "รอลบ" = นิยาม PENDING_OBJ_SQL ของ T0.8 ──
  const docCounts = paxIds.length
    ? await g.db.$queryRawUnsafe<{ passengerId: string; live: number; pendingDeletion: number }[]>(
        `SELECT x."passengerId", count(*) FILTER (WHERE x."deletedAt" IS NULL)::int AS "live", count(*) FILTER (WHERE x."pendingDeletion")::int AS "pendingDeletion"
         FROM (SELECT "passengerId", "deletedAt", ${PENDING_OBJ_SQL.sql} FROM "TripDocument" WHERE "tenantId" = $1 AND "unitId" = $2 AND "passengerId" = ANY($3::text[])) x
         GROUP BY x."passengerId" LIMIT $4::int`,
        g.tenantId,
        g.unitId,
        paxIds,
        TRIPS_MANIFEST_PAX_CAP,
      )
    : [];

  // ── ตารางค้น ──
  const paxTypeOf = new Map(paxTypes.map((p) => [p.id, p]));
  const extraOf = new Map(extras.map((x) => [x.id, x]));
  const resourceOf = new Map(resources.map((r) => [r.id, r]));
  const nameOf = new Map(briefs.map((p) => [p.id, p.name]));
  const docsOf = new Map(docCounts.map((d) => [d.passengerId, d]));
  const aggOf = new Map(perBooking.map((a) => [a.bookingId, a]));
  const inMSet = new Set(inM.map((x) => x.id));
  const groupBy = <T extends { bookingId: string }>(list: readonly T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      const cur = m.get(x.bookingId);
      if (cur) cur.push(x);
      else m.set(x.bookingId, [x]);
    }
    return m;
  };
  const itemsOf = groupBy(items);
  const paxOfBooking = groupBy(paxRows);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const paxQtyVm = (qty: Map<string, number>): ManifestPaxQty[] =>
    [...qty.entries()]
      .map(([paxTypeId, n]) => ({ pt: paxTypeOf.get(paxTypeId), paxTypeId, n }))
      .sort((x, y) => (x.pt?.sortOrder ?? 0) - (y.pt?.sortOrder ?? 0) || (x.pt?.code ?? "").localeCompare(y.pt?.code ?? ""))
      .map((x) => ({ paxTypeId: x.paxTypeId, code: x.pt?.code ?? "", labelTh: i18nTh(x.pt?.label), labelEn: i18nEn(x.pt?.label), qty: x.n }));
  const extraQtyVm = (qty: Map<string, number>): ManifestExtraQty[] =>
    [...qty.entries()].map(([extraId, n]) => ({ extraId, nameTh: i18nTh(extraOf.get(extraId)?.name), nameEn: i18nEn(extraOf.get(extraId)?.name), qty: n })).sort((x, y) => x.nameTh.localeCompare(y.nameTh) || x.extraId.localeCompare(y.extraId));
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  // ── จุดรับ: รถเรียงตามเวลาจุดรับแรกที่ใช้ได้ → สร้างก่อน → id · การจองอยู่หลายรถ ⇒ รถแรกตามลำดับนี้ ตัวหลังเป็นจุดรับค้าง ──
  let staleStops = 0;
  const liveRuns = parsedRuns
    .map((r) => {
      const usable = r.stops.filter((s) => shown.has(s.bookingId));
      staleStops += r.stops.filter((s) => !shown.has(s.bookingId) && !inMSet.has(s.bookingId)).length;
      return { ...r, usable };
    })
    .sort((x, y) => (x.usable[0]?.time ?? "99:99").localeCompare(y.usable[0]?.time ?? "99:99") || x.createdAt.getTime() - y.createdAt.getTime() || x.id.localeCompare(y.id));
  const stopOf = new Map<string, { runId: string; stop: RunStop }>();
  const runStops = liveRuns
    .map((r) => {
      const mine = r.usable.filter((s) => !stopOf.has(s.bookingId));
      staleStops += r.usable.length - mine.length;
      for (const s of mine) stopOf.set(s.bookingId, { runId: r.id, stop: s });
      return { id: r.id, resourceId: r.resourceId, createdAt: r.createdAt, stops: mine };
    })
    .filter((r) => r.stops.length > 0)
    .sort((x, y) => x.stops[0].time.localeCompare(y.stops[0].time) || x.createdAt.getTime() - y.createdAt.getTime() || x.id.localeCompare(y.id));

  // ── แถวต่อการจอง ──
  const nowMs = now.getTime();
  const startsMs = new Date(dep.startsAt).getTime();
  const depPart = { bookingStatus: "", piiPurgedAt: null, bookingCreatedAt: dep.startsAt, productId: dep.productId, departureId: dep.id, localDate: dep.localDate, startsAt: dep.startsAt, endsAt: dep.endsAt, crossBorder: product.crossBorder, deepDive: product.deepDive, title: null };
  const finCount = new Map<string, number>();
  let finMissing = 0;
  let waiverRequired = 0;
  let waiverSigned = 0;
  let healthProvided = 0;
  let healthMissing = 0;
  const travellerOf = (its: readonly ItemRow[], r: PaxSelect, no: number): { vm: ManifestPaxVM; hint: string | null; phone: string | null } => {
    const a = parseAnswers(r.answers);
    const docs = docsOf.get(r.id);
    const seatTypes = [...new Set(its.filter((i) => i.kind === "SEAT" && i.paxTypeId).map((i) => String(i.paxTypeId)))];
    const item = r.itemId ? itemById.get(r.itemId) : undefined;
    // ประเภทคน: จากรายการที่ผูกกับแถว · แถวที่ไม่ผูกรายการแต่การจองมีประเภทคนเดียว ⇒ ประเภทนั้น
    const pt = paxTypeOf.get(item?.kind === "SEAT" && item.paxTypeId ? item.paxTypeId : seatTypes.length === 1 ? seatTypes[0] : "");
    const paxType = { paxTypeCode: pt?.code ?? null, paxTypeTh: pt ? i18nTh(pt.label) : null, paxTypeEn: pt ? i18nEn(pt.label) : null };
    if (isPurgedAll(a)) {
      return {
        vm: { passengerId: r.id, no, fullName: null, purged: true, ...paxType, nationality: null, docType: null, docMasked: null, isMinor: false, formStatus: r.formStatus, missing: [], waiver: "NOT_REQUIRED", health: "PURGED", finSize: null, docs: { live: 0, pendingDeletion: docs?.pendingDeletion ?? 0 } },
        hint: null,
        phone: null,
      };
    }
    const v = valuesOf({ ...r, ...depPart, docNumberEnc: null, guardianConsent: null, retainUntil: null, checkinAt: null }, a);
    const health = healthViewOf(cfg.spec, a);
    const waiver = waiverStatusOf(cfg.spec, r.waiverEvidence, nowMs, startsMs, { knownMinor: r.isMinor, answers: a });
    const name = v.fullName.trim();
    return {
      vm: {
        passengerId: r.id,
        no,
        fullName: name.length > 0 ? v.fullName : null,
        purged: false,
        ...paxType,
        nationality: v.nationality,
        docType: v.docType,
        docMasked: maskDoc(v.docLast4),
        isMinor: r.isMinor,
        formStatus: r.formStatus,
        missing: missingFields(cfg.spec, v, a),
        waiver,
        health,
        finSize: v.finSize,
        docs: { live: docs?.live ?? 0, pendingDeletion: docs?.pendingDeletion ?? 0 },
      },
      hint: v.pickupHotel && v.pickupHotel.trim() ? v.pickupHotel : null,
      phone: v.phone,
    };
  };
  const rowOf = (b: BookingRow): ManifestRowVM => {
    const its = itemsOf.get(b.id) ?? [];
    const paxQty = new Map<string, number>();
    const extraQty = new Map<string, number>();
    let seats = 0;
    for (const it of its) {
      if (it.kind === "SEAT") {
        seats += it.qty;
        if (it.paxTypeId) add(paxQty, it.paxTypeId, it.qty);
      } else if (it.kind === "EXTRA" && it.extraId && !it.passThrough) add(extraQty, it.extraId, it.qty);
    }
    const loaded = (paxOfBooking.get(b.id) ?? []).map((r, i) => travellerOf(its, r, i + 1));
    const travellers = loaded.map((x) => x.vm);
    const live = travellers.filter((t) => !t.purged);
    const agg = aggOf.get(b.id) ?? ZERO_AGG;
    const doc = {
      state: manifestDocState({ seats, slots: agg.slots, purged: agg.purged, named: agg.named, formComplete: agg.formComplete }),
      slots: agg.slots,
      named: agg.named,
      missingNames: Math.max(0, seats - agg.named),
      formComplete: agg.formComplete,
      waiverRequired: live.filter((t) => t.waiver !== "NOT_REQUIRED").length,
      waiverSigned: live.filter((t) => t.waiver === "SIGNED").length,
      healthProvided: live.filter((t) => t.health === "PROVIDED").length,
      healthMissing: live.filter((t) => t.health === "MISSING" || t.health === "GUARDIAN_REQUIRED").length,
      needsFix: agg.needsFix,
    };
    waiverRequired += doc.waiverRequired;
    waiverSigned += doc.waiverSigned;
    healthProvided += doc.healthProvided;
    healthMissing += doc.healthMissing;
    for (const t of live) {
      if (t.finSize && t.finSize.trim()) add(finCount, t.finSize.trim(), 1);
      else finMissing++;
    }
    const st = stopOf.get(b.id)?.stop ?? null;
    const purged = b.piiPurgedAt !== null;
    const viaAgent = b.contactRoute === "VIA_AGENT";
    const payable = b.grossSatang - b.discountSatang - b.agentDiscountSatang;
    return {
      bookingId: b.id,
      code: b.code,
      status: b.status,
      bookerName: purged || !b.bookerPartyId ? null : (nameOf.get(b.bookerPartyId) ?? null),
      bookerPurged: purged,
      channel: b.channel,
      agentAccountId: b.agentAccountId,
      agentRef: b.agentRef,
      contactRoute: viaAgent ? "VIA_AGENT" : "DIRECT",
      pax: paxQtyVm(paxQty),
      extras: extraQtyVm(extraQty),
      seats,
      pickup: { time: st?.time ?? null, place: st?.place ?? null, note: st?.note ?? null, hint: loaded.find((x) => x.hint !== null)?.hint ?? null, paid: its.some((i) => i.kind === "PICKUP") },
      doc,
      outstandingSatang: canSeeMoney ? (OWES.includes(b.status) ? Math.max(0, payable - b.paidSatang) : 0) : null,
      phoneMasked: viaAgent ? null : maskPhone(loaded.find((x) => x.phone)?.phone ?? null),
      travellers,
    };
  };
  const rows = bookings.map(rowOf);
  const rowById = new Map(rows.map((r) => [r.bookingId, r]));
  const peopleOf = (list: readonly ManifestRowVM[]) => list.reduce((n, r) => n + r.seats, 0);

  // ── กลุ่ม ──
  const runGroups: ManifestGroupVM[] = runStops.map((r) => {
    const list = r.stops.map((s) => rowById.get(s.bookingId)).filter((x): x is ManifestRowVM => !!x);
    const res = resourceOf.get(r.resourceId);
    const route: string[] = [];
    for (const s of r.stops) if (route[route.length - 1] !== s.place) route.push(s.place);
    return { key: `run:${r.id}`, kind: "RUN", run: { id: r.id, resourceId: r.resourceId, vehicleName: res?.name ?? null, vehicleSeats: res?.seats ?? null, driverName: null, route }, people: peopleOf(list), rows: list };
  });
  const unassigned = rows.filter((r) => !stopOf.has(r.bookingId));
  const groups: ManifestGroupVM[] =
    view === "booking"
      ? rows.length
        ? [{ key: "all", kind: "ALL", run: null, people: peopleOf(rows), rows }]
        : []
      : [...runGroups, ...(unassigned.length ? [{ key: "unassigned", kind: "UNASSIGNED" as const, run: null, people: peopleOf(unassigned), rows: unassigned }] : [])];

  // ── ยอดรวม ──
  const paxTotals = new Map<string, number>();
  const extraTotals = new Map<string, number>();
  let people = 0;
  for (const i of itemAgg) {
    if (i.kind === "SEAT") {
      people += i.qty;
      if (i.paxTypeId) add(paxTotals, i.paxTypeId, i.qty);
    } else if (i.extraId) add(extraTotals, i.extraId, i.qty);
  }
  const paxShown = paxRows.length;
  const paxTruncated = paxCount > paxShown;
  const partial = truncated || paxTruncated;
  const assignedPeople = runGroups.reduce((n, x) => n + x.people, 0);
  const byKind = (kind: string) => uses.map((x) => resourceOf.get(x.resourceId)).filter((r): r is NonNullable<typeof r> => !!r && r.kind === kind).map((r) => ({ id: r.id, name: r.name })).sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  const guides = byKind("GUIDE");
  const local = utcToLocal(u.tz, now);
  const vm: ManifestVM = {
    unit: { id: g.unitId, slug: g.unitSlug, name: g.unitName, tz: u.tz, today: local.ymd, nowIso: now.toISOString(), nowLocal: `${local.ymd} ${hhmm(local.minutes)}` },
    flags: { canSeeMoney, canSeeHealth, canExport: true, canPrint: true, canEditRuns: false, canSend: false },
    view,
    departure: {
      id: dep.id,
      productId: dep.productId,
      titleTh: i18nTh(product.title),
      titleEn: i18nEn(product.title),
      optionTh: option ? i18nTh(option.name) || null : null,
      optionEn: option ? i18nEn(option.name) : null,
      localDate: e.localDate,
      timeText: timeTextOf(u.tz, dep.startsAt, dep.endsAt),
      status: dep.status,
      capacity: dep.capacity,
      sold: dep.sold,
      boats: byKind("BOAT"),
      guides,
    },
    totals: {
      bookings: bookingsTotal,
      people,
      pax: paxQtyVm(paxTotals),
      slots: paxAll.slots,
      named: paxAll.named,
      missingNames: Math.max(0, people - paxAll.named),
      formComplete: paxAll.formComplete,
      purged: paxAll.purged,
      waiverRequired: partial ? null : waiverRequired,
      waiverSigned: partial ? null : waiverSigned,
      healthProvided: partial ? null : healthProvided,
      healthMissing: partial ? null : healthMissing,
      outstandingSatang: canSeeMoney ? Number(bookingAgg[0]?.outstanding ?? 0) : null,
      agentCollectBookings: canSeeMoney ? (bookingAgg[0]?.agentCollect ?? 0) : null,
      pickup: { assignedPeople, vehicles: runGroups.length, unassignedPeople: Math.max(0, people - assignedPeople), staleStops },
      pendingBookings,
    },
    prep: {
      extras: extraQtyVm(extraTotals),
      finSizes: [...finCount.entries()].map(([size, n]) => ({ size, n })).sort((x, y) => x.size.localeCompare(y.size, "en", { numeric: true })),
      finMissing,
      meals: { travellers: people, guides: guides.length },
    },
    groups,
    bookingsTotal,
    bookingsShown: bookings.length,
    bookingCap: TRIPS_MANIFEST_BOOKING_CAP,
    truncated,
    paxTotal: paxCount,
    paxShown,
    paxCap: TRIPS_MANIFEST_PAX_CAP,
    paxTruncated,
  };
  return { vm };
}

/** ใบรายชื่อของรอบ — 2 มุมมอง: ตามรถรับส่ง (ปริยาย) · ตามการจอง · อ่านอย่างเดียว */
export async function loadManifestVM(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<{ ok: true; vm: ManifestVM } | Fail> {
  const p = parse(LOAD_IN, input);
  if (isFail(p)) return p;
  const e = await enter(ctx, p.unitId, p.departureId);
  if (isFail(e)) return e;
  const r = await build(e, p.view ?? "pickup", nowOf(opts));
  return isFail(r) ? r : { ok: true, vm: r.vm };
}

// ═══════════════ บริการ (เขียนเฉพาะแถว AuditLog) ═══════════════
/** ห่อบริการ: ข้อผิดพลาดที่ไม่คาดคิด ⇒ บันทึก ops แบบไม่มีข้อความดิบ (ตัวห่อของ T0.8) + BUSY */
async function guarded<T>(where: string, ctx: unknown, fn: () => Promise<Ok<T> | Fail>): Promise<Ok<T> | Fail> {
  const r = await safely(where, ctx, async () => ({ ok: true as const, value: await fn() }));
  return r.ok ? r.value : fail("BUSY");
}
const who = (g: TripsUnitGate) => ({ kind: "USER" as const, userId: g.actorUserId });

type Dict = Record<string, string>;
const TEXT = { th: thMessages, en: enMessages } as const;
const word = (d: Dict, code: string | null): string => (code ? (d[code] ?? "") : "");
export type ManifestCsvOut = { filename: string; csv: string; rows: number; truncated: boolean; purgedSkipped: number };
/**
 * ส่งออก CSV — 1 แถวต่อผู้เดินทางที่ยังไม่ถูกลบ (เรียง กลุ่มตามรถ → แถว → ลำดับคน) · การจองที่ไม่มีแถวผู้เดินทางเหลือ ⇒ 1 แถว (ช่องรายคนว่าง)
 * ไม่มี: เลขเอกสารเต็ม · เนื้อหาสุขภาพ · วันเกิด · เบอร์ · อีเมล · ยอดเงิน · รหัสภายใน · ผู้เดินทางที่ถูกลบ · เซลล์สถานะ = ข้อความตามภาษา · ทุกเซลล์ผ่าน csvCell
 * audit trips.manifest.exported ในธุรกรรมก่อนคืนไฟล์ (บันทึกไม่ได้ ⇒ ไม่คืนข้อมูล) · เรียกซ้ำ = ไฟล์เดิม + แถว audit ใหม่ (การนำออกแต่ละครั้งคือเหตุการณ์จริง)
 */
export async function exportManifestCsv(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<Ok<ManifestCsvOut> | Fail> {
  return guarded("exportManifestCsv", ctx, async () => {
    const p = parse(EXPORT_IN, input);
    if (isFail(p)) return p;
    const e = await enter(ctx, p.unitId, p.departureId);
    if (isFail(e)) return e;
    const b = await build(e, "pickup", nowOf(opts));
    if (isFail(b)) return b;
    const vm = b.vm;
    const locale = p.locale ?? "th";
    const M = TEXT[locale].manifest;
    const channels: Dict = TEXT[locale].bookings.channel;
    const head: Dict = M.csv;
    const lines: (string | number | null)[][] = [];
    for (const grp of vm.groups) {
      const groupName = grp.run ? (grp.run.vehicleName ?? M.group.vehicleRemoved) : M.group.unassigned;
      for (const row of grp.rows) {
        const lead = [groupName, row.pickup.time, row.pickup.place, row.code, row.bookerPurged ? null : row.bookerName, word(channels, row.channel)];
        const live = row.travellers.filter((t) => !t.purged);
        if (!live.length) lines.push([...lead, null, null, null, null, null, null, null, null, null, null]);
        for (const t of live) {
          lines.push([...lead, t.no, t.fullName, locale === "en" ? (t.paxTypeEn ?? t.paxTypeTh) : t.paxTypeTh, t.nationality, word(M.docType, t.docType), t.docMasked, word(M.formStatus, t.formStatus), word(M.waiver, t.waiver), word(M.health, t.health), t.finSize]);
        }
      }
    }
    const kept = lines.slice(0, TRIPS_MANIFEST_PAX_CAP);
    const out: ManifestCsvOut = {
      filename: manifestFileName(vm.departure.localDate, vm.departure.id),
      csv: manifestCsv(MANIFEST_CSV_COLUMNS.map((c) => head[c] ?? ""), kept),
      rows: kept.length,
      truncated: vm.truncated || vm.paxTruncated || kept.length < lines.length,
      purgedSkipped: vm.totals.purged,
    };
    const w = await inTx(e.u, (tx) => auditTx(tx, e.u, who(e.g), A_EXPORTED, "TripDeparture", e.dep.id, { departureId: e.dep.id, format: "CSV", purpose: "MANIFEST", rows: out.rows, truncated: out.truncated, purgedSkipped: out.purgedSkipped }));
    if (!w.ok) return fail("BUSY");
    return { ok: true, value: out };
  });
}

export type ManifestHealthItem = { passengerId: string; bookingId: string; code: string; fullName: string | null; allergies: string | null; conditions: string | null };
export type ManifestHealthOut = { purpose: ManifestHealthPurpose; count: number; truncated: boolean; items: ManifestHealthItem[] };
/**
 * เปิดดูข้อมูลสุขภาพของรอบ — เฉพาะผู้เดินทางของการจองในใบที่ให้ข้อมูลไว้และยังไม่ถูกลบ (สูงสุด TRIPS_MANIFEST_PAX_CAP คน · เกิน ⇒ truncated)
 * สิทธิ์: ดูใบรายชื่อได้ ∧ trips.passenger.health ตรงตัว (สิทธิ์กว้าง/ผู้จัดการไม่พอ) · เปิดด้วย openHealth ของ T0.8 · กล่องใดเปิดไม่ได้ ⇒ BUSY ทั้งคำขอ ไม่เขียน audit
 * audit: 1 แถว trips.passenger.revealed ต่อผู้เดินทางที่คืน (คำสั่งเดียว ในธุรกรรม · commit ก่อนคืนค่า · ไม่มีเนื้อหา)
 */
export async function revealManifestHealth(ctx: TripsScreenCtx, input: unknown, _opts?: Opts): Promise<Ok<ManifestHealthOut> | Fail> {
  return guarded("revealManifestHealth", ctx, async () => {
    const p = parse(REVEAL_IN, input);
    if (isFail(p)) return p;
    const e = await enter(ctx, p.unitId, p.departureId);
    if (isFail(e)) return e;
    if (!canSeeSensitive(e.g.member, HEALTH_KEY, e.g.unitId)) return tripsFail("FORBIDDEN");
    const found = await e.g.db.$queryRawUnsafe<{ id: string; bookingId: string; code: string; fullName: string; answers: unknown }[]>(
      `SELECT p."id", p."bookingId", b."code", p."fullName", p."answers" ${PAX_JOIN}
       WHERE p."tenantId" = $1 AND p."unitId" = $2 AND ${M_WHERE} AND p."answers"->'health'->>'status' = 'PROVIDED' AND NOT ${PURGED_SQL}
       ORDER BY b."code" ASC, b."id" ASC, p."createdAt" ASC, p."id" ASC LIMIT $5::int`,
      ...mArgs(e),
      TRIPS_MANIFEST_PAX_CAP + 1,
    );
    const opened = found.slice(0, TRIPS_MANIFEST_PAX_CAP).map((r) => {
      const a = parseAnswers(r.answers);
      return { r, skip: isPurgedAll(a) || a.health?.status !== "PROVIDED", h: openHealth(e.u, r.id, a.health) };
    });
    const items: ManifestHealthItem[] = [];
    for (const x of opened) {
      if (x.skip) continue;
      if (x.h === "LOCKED" || x.h === null) return fail("BUSY");
      items.push({ passengerId: x.r.id, bookingId: x.r.bookingId, code: x.r.code, fullName: x.r.fullName.trim() ? x.r.fullName : null, allergies: x.h.allergies, conditions: x.h.conditions });
    }
    if (items.length) {
      const actor = who(e.g);
      const w = await inTx(e.u, (tx) =>
        tx.auditLog.createMany({
          data: items.map((it) => ({
            tenantId: e.g.tenantId,
            unitId: e.g.unitId,
            actorType: "USER" as const,
            actorId: actor.userId,
            action: A_REVEALED,
            targetType: "TripPassenger",
            targetId: it.passengerId,
            after: { passengerId: it.passengerId, what: "HEALTH", purpose: p.purpose, via: "MANIFEST", departureId: e.dep.id },
          })),
        }),
      );
      if (!w.ok || w.value.count !== items.length) return fail("BUSY");
    }
    return { ok: true, value: { purpose: p.purpose, count: items.length, truncated: found.length > TRIPS_MANIFEST_PAX_CAP, items } };
  });
}

export type ManifestPrintOut = { passengers: number; printedLocal: string };
/** บันทึกการพิมพ์ใบรายชื่อ (เรียกก่อนเปิดกล่องพิมพ์ของเบราว์เซอร์) — passengers = ผู้เดินทางที่ยังไม่ถูกลบในใบ · printedLocal = เวลาร้านของการบันทึก */
export async function recordManifestPrint(ctx: TripsScreenCtx, input: unknown, opts?: Opts): Promise<Ok<ManifestPrintOut> | Fail> {
  return guarded("recordManifestPrint", ctx, async () => {
    const p = parse(PRINT_IN, input);
    if (isFail(p)) return p;
    const e = await enter(ctx, p.unitId, p.departureId);
    if (isFail(e)) return e;
    const agg = await paxAggOfM(e);
    const passengers = Math.max(0, agg.slots - agg.purged);
    const w = await inTx(e.u, (tx) => auditTx(tx, e.u, who(e.g), A_PRINTED, "TripDeparture", e.dep.id, { departureId: e.dep.id, purpose: "MANIFEST", passengers }));
    if (!w.ok) return fail("BUSY");
    const local = utcToLocal(e.u.tz, nowOf(opts));
    return { ok: true, value: { passengers, printedLocal: `${local.ymd} ${hhmm(local.minutes)}` } };
  });
}
