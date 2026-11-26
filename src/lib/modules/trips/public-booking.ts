// ─────────────────────────────────────────────────────────────
// trips/public-booking.ts — ตัวอ่านของเส้นจองหน้าสาธารณะ `/book/[shop]` (เลือก → ถือ → ยืนยัน → หน้าการจอง) · RUN TRIPS W1.2a
// ใบสั่ง ledger/trips-briefs/W1.2.md §2 §3.2
//
// 🔴 อ่านอย่างเดียว: ไม่มีคำสั่งเขียนฐาน (การเขียนทั้งหมดผ่าน holdTrips/confirmTrips ของ booking.ts) · ไม่เปิดธุรกรรม
// 🔴 ทุกคิวรีผูก tenantId + หน่วยของร้านที่ผู้เรียก resolve แล้ว (ผ่าน unitDb ของโมดูล)
// 🔴 คืน id ภายในให้ผู้เรียกฝั่งเซิร์ฟเวอร์ (platform/trips-book) เพื่อเรียกบริการ — ผู้เรียกแปลงเป็น ref สาธารณะก่อนออก VM เสมอ
// 🔴 ที่ว่าง = listAvailability (T0.4) · ไม่อ่านตารางราคา/ตัวนับที่นั่งเอง
// ─────────────────────────────────────────────────────────────
import type { SellCtx } from "@/lib/core/sellable";
import { normalizePartyPhone } from "@/lib/modules/party";
import { bookerPhoneKey, typedBookerOf } from "./booking-view-core";
import { listAvailability } from "./capacity-service";
import { hhmm, normalizeTimezone, utcToLocal } from "./departures-core";
import { localize, type I18n, type I18nText } from "./products-core";
import { unitDb } from "./resources";

export type BookText = { text: string | null; fallback: boolean };
export type BookCatalog = {
  paxTypes: { id: string; code: string; label: BookText; ageMin: number | null; ageMax: number | null; seat: boolean; active: boolean }[];
  extras: { id: string; productLevel: boolean; mandatory: boolean; active: boolean; basis: string; name: BookText; note: BookText }[];
  zones: { id: string; kind: string; name: BookText; areas: BookText; surchargeSatang: number; active: boolean }[];
};
/** optionName = ชื่อตัวเลือกของรอบตามภาษา (ตัวอ่านเดียวกับหน้าสินค้า) — ใช้จับคู่รอบกับแถวของหน้าสินค้า (มติ Y3) */
export type BookDaySlot = { departureId: string; optionId: string | null; optionName: BookText; startsAt: string; startTime: string; timeText: string; status: string; publicLeft: number; saleBlock: string | null };
export type BookDepartureRow = {
  departureId: string;
  productId: string;
  optionId: string | null;
  localDate: string;
  startsAt: string;
  startTime: string;
  timeText: string;
  product: { slug: string; title: BookText; status: string; productType: string; deepDive: boolean };
};
export type BookBasketRow = {
  basketId: string;
  status: string;
  channel: string;
  unitId: string;
  holds: { id: string; departureId: string; qty: number; status: string; expiresAt: string }[];
  bookingIds: string[];
};
export type BookReservationRow = {
  bookingId: string;
  unitId: string;
  code: string;
  status: string;
  departureId: string;
  paidSatang: number;
  /** ผู้เก็บเงินของการจอง (SHOP | AGENT) — หน้าการจองออก QR ของร้านเฉพาะ SHOP */
  collectMode: string;
  policySnapshot: unknown;
  holdExpiresAt: string | null;
  named: number;
  waiversSigned: number;
};

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128;
const dbOf = (tenantId: string, unitId: string) => unitDb({ tenantId, unitId, tz: "", actorId: null, actorType: "SYSTEM" });
const textOf = (json: unknown, locale: string): BookText => {
  const l = localize(isRec(json) ? (json as I18nText | I18n) : null, locale);
  return { text: l.text, fallback: l.fallback };
};
/** ชื่อโซน: ไทยเป็นคอลัมน์ name · อังกฤษเป็น nameEn (ว่าง ⇒ ไทย + fallback) */
const zoneNameOf = (name: string, nameEn: string | null, locale: string): BookText => {
  if (locale === "en") {
    const en = typeof nameEn === "string" ? nameEn.trim() : "";
    return en ? { text: en, fallback: false } : { text: name.trim() || null, fallback: name.trim() !== "" };
  }
  return { text: name.trim() || null, fallback: false };
};
const ymdOf = (d: Date): string => d.toISOString().slice(0, 10);
const local = (tz: string, d: Date): string => hhmm(utcToLocal(tz, d).minutes);
/** ช่วงเวลาของรอบ "HH:MM–HH:MM" ตามเวลาร้าน */
const timeTextOf = (tz: string, startsAt: Date, endsAt: Date): string => `${local(tz, startsAt)}–${local(tz, endsAt)}`;

/** ประเภทคน · รายการเสริม (ของสินค้า + ของหน่วย) · โซนรับส่งของหน่วย — ทุกแถว (ผู้เรียกกรองตาม active/ชนิดเอง) ข้อความตามภาษา */
export async function loadBookCatalog(ref: { tenantId: string; unitId: string; productId: string }, locale: string): Promise<BookCatalog> {
  const { tenantId, unitId, productId } = ref;
  const db = dbOf(tenantId, unitId);
  const [pax, extras, zones] = await Promise.all([
    db.tripPaxType.findMany({ where: { tenantId, unitId, productId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, code: true, label: true, ageMin: true, ageMax: true, countsCapacity: true, active: true } }),
    db.tripExtra.findMany({
      where: { tenantId, unitId, OR: [{ productId }, { productId: null }] },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, productId: true, mandatory: true, active: true, basis: true, name: true, note: true },
    }),
    db.tripPickupZone.findMany({ where: { tenantId, unitId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, kind: true, name: true, nameEn: true, areas: true, surchargeSatang: true, active: true } }),
  ]);
  return {
    paxTypes: pax.map((p) => ({ id: p.id, code: p.code, label: textOf(p.label, locale), ageMin: p.ageMin, ageMax: p.ageMax, seat: p.countsCapacity, active: p.active })),
    extras: extras.map((e) => ({ id: e.id, productLevel: e.productId === productId, mandatory: e.mandatory, active: e.active, basis: e.basis, name: textOf(e.name, locale), note: textOf(e.note, locale) })),
    // kind null = โซนรุ่นเก่า (ยังไม่ย้าย · A1.1) ⇒ ถือเป็นโซนรับปกติ · active null = ยังไม่ย้าย ⇒ เปิด
    zones: zones.map((z) => ({ id: z.id, kind: z.kind === "SELF" ? "SELF" : "ZONE", name: zoneNameOf(z.name, z.nameEn, locale), areas: textOf(z.areas, locale), surchargeSatang: z.surchargeSatang, active: z.active !== false })),
  };
}

/** รอบของวันเดียวของสินค้า (ตัวกรองสาธารณะของ T0.4 · รวมรอบที่ขายไม่ได้พร้อมเหตุ) เรียงเวลาออก — บริการปฏิเสธ ⇒ null */
export async function loadBookDay(ref: { tenantId: string; unitId: string; productId: string; tz: string }, date: string, opts: { now: Date; locale: "th" | "en" }): Promise<BookDaySlot[] | null> {
  const { tenantId, unitId, productId } = ref;
  const tz = normalizeTimezone(ref.tz);
  const ctx: SellCtx = { tenantId, unitId, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "book-view" }, now: opts.now, locale: opts.locale };
  const av = await listAvailability(ctx, { productId, from: date, to: date });
  if (!av.ok) return null;
  const rows = [...av.value].sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.slotId < b.slotId ? -1 : 1));
  if (!rows.length) return [];
  const db = dbOf(tenantId, unitId);
  const [deps, options] = await Promise.all([
    db.tripDeparture.findMany({ where: { tenantId, unitId, productId, id: { in: rows.map((r) => r.slotId) } }, select: { id: true, optionId: true, startsAt: true, endsAt: true } }),
    db.tripOption.findMany({ where: { tenantId, unitId, productId }, select: { id: true, name: true } }),
  ]);
  const byId = new Map(deps.map((d) => [d.id, d]));
  const optById = new Map(options.map((o) => [o.id, o]));
  const out: BookDaySlot[] = [];
  for (const r of rows) {
    const d = byId.get(r.slotId);
    if (!d) continue;
    out.push({
      departureId: d.id,
      optionId: d.optionId,
      optionName: textOf(d.optionId ? optById.get(d.optionId)?.name : null, opts.locale),
      startsAt: d.startsAt.toISOString(),
      startTime: local(tz, d.startsAt),
      timeText: timeTextOf(tz, d.startsAt, d.endsAt),
      status: r.status,
      publicLeft: Number.isInteger(r.publicLeft) && r.publicLeft > 0 ? r.publicLeft : 0,
      saleBlock: r.saleBlock,
    });
  }
  return out;
}

/** รอบ + สินค้าของรอบ (หน้ายืนยัน/หน้าการจอง) — ไม่ใช่ของหน่วยนี้ ⇒ null */
export async function loadBookDeparture(ref: { tenantId: string; unitId: string; tz: string }, departureId: string, locale: string): Promise<BookDepartureRow | null> {
  if (!isId(departureId)) return null;
  const { tenantId, unitId } = ref;
  const tz = normalizeTimezone(ref.tz);
  const db = dbOf(tenantId, unitId);
  const d = await db.tripDeparture.findFirst({ where: { id: departureId, tenantId, unitId }, select: { id: true, productId: true, optionId: true, localDate: true, startsAt: true, endsAt: true } });
  if (!d) return null;
  const p = await db.tripProduct.findFirst({ where: { id: d.productId, tenantId, unitId }, select: { slug: true, title: true, status: true, productType: true, deepDive: true } });
  if (!p) return null;
  return {
    departureId: d.id,
    productId: d.productId,
    optionId: d.optionId,
    localDate: ymdOf(d.localDate),
    startsAt: d.startsAt.toISOString(),
    startTime: local(tz, d.startsAt),
    timeText: timeTextOf(tz, d.startsAt, d.endsAt),
    product: { slug: p.slug, title: textOf(p.title, locale), status: p.status, productType: p.productType, deepDive: p.deepDive },
  };
}

/** ตะกร้าสาธารณะจาก sha256(token ตะกร้า) ของร้านนี้ (หน่วยต้องอยู่ใน unitIds) + ที่ถือ + การจองที่เกิดจากตะกร้า — ไม่พบ ⇒ null */
export async function findBookBasket(ref: { tenantId: string; unitIds: string[] }, tokenHash: string): Promise<BookBasketRow | null> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || !ref.unitIds.length) return null;
  const { tenantId } = ref;
  const db = dbOf(tenantId, ref.unitIds[0] ?? "");
  const bs = await db.$queryRaw<{ id: string; status: string; channel: string; unitIds: string[] }[]>`
    SELECT "id", "status", "channel", "unitIds" FROM "SellBasket" WHERE "publicTokenHash" = ${tokenHash} AND "tenantId" = ${tenantId} LIMIT 1`;
  const b = bs[0];
  if (!b) return null;
  const holds = await db.$queryRaw<{ id: string; unitId: string; departureId: string; qtyPublic: number; qtyAllot: number; status: string; expiresAt: Date; idempotencyKey: string }[]>`
    SELECT "id", "unitId", "departureId", "qtyPublic", "qtyAllot", "status", "expiresAt", "idempotencyKey" FROM "TripHold" WHERE "basketId" = ${b.id} AND "tenantId" = ${tenantId}`;
  const unitId = holds[0]?.unitId ?? b.unitIds[0] ?? "";
  if (!ref.unitIds.includes(unitId) || holds.some((h) => h.unitId !== unitId)) return null;
  const idx = (k: string) => Number(/_(\d+)@[^@]*$/.exec(k)?.[1] ?? "9999");
  holds.sort((a, z) => idx(a.idempotencyKey) - idx(z.idempotencyKey) || (a.id < z.id ? -1 : 1));
  const bookings = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripBooking" WHERE "basketId" = ${b.id} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} ORDER BY "id"`;
  return {
    basketId: b.id,
    status: b.status,
    channel: b.channel,
    unitId,
    holds: holds.map((h) => ({ id: h.id, departureId: h.departureId, qty: Number(h.qtyPublic) + Number(h.qtyAllot), status: h.status, expiresAt: new Date(h.expiresAt).toISOString() })),
    bookingIds: bookings.map((x) => x.id),
  };
}

/** การจองจาก sha256(token การจอง) ของร้านนี้ (หน่วย TRIPS ที่ resolve แล้ว) + เวลาถือที่ยัง ACTIVE + จำนวนผู้เดินทางที่มีชื่อ/เซ็นแล้ว — ไม่พบ ⇒ null */
export async function findBookReservation(ref: { tenantId: string; unitIds: string[] }, tokenHash: string): Promise<BookReservationRow | null> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || !ref.unitIds.length) return null;
  const { tenantId } = ref;
  const db = dbOf(tenantId, ref.unitIds[0] ?? "");
  const rows = await db.$queryRaw<{ id: string; unitId: string; code: string; status: string; departureId: string; paidSatang: number; collectMode: string; policySnapshot: unknown }[]>`
    SELECT "id", "unitId", "code", "status", "departureId", "paidSatang", "collectMode", "policySnapshot" - 'booker' AS "policySnapshot" FROM "TripBooking"
    WHERE "publicTokenHash" = ${tokenHash} AND "tenantId" = ${tenantId} AND "unitId" = ANY(${ref.unitIds}::text[]) LIMIT 1`;
  const b = rows[0];
  if (!b) return null;
  const [holds, pax] = await Promise.all([
    db.$queryRaw<{ expiresAt: Date }[]>`
      SELECT "expiresAt" FROM "TripHold" WHERE "bookingId" = ${b.id} AND "tenantId" = ${tenantId} AND "unitId" = ${b.unitId} AND "status" = 'ACTIVE' ORDER BY "expiresAt" ASC`,
    db.$queryRaw<{ named: number; signed: number }[]>`
      SELECT count(*) FILTER (WHERE btrim("fullName") <> '')::int AS "named", count(*) FILTER (WHERE "waiverSignedAt" IS NOT NULL)::int AS "signed"
      FROM "TripPassenger" WHERE "bookingId" = ${b.id} AND "tenantId" = ${tenantId} AND "unitId" = ${b.unitId}`,
  ]);
  const exp = holds[0]?.expiresAt;
  return {
    bookingId: b.id,
    unitId: b.unitId,
    code: b.code,
    status: b.status,
    departureId: b.departureId,
    paidSatang: Number(b.paidSatang),
    collectMode: String(b.collectMode),
    policySnapshot: b.policySnapshot,
    holdExpiresAt: exp ? new Date(exp).toISOString() : null,
    named: Number(pax[0]?.named ?? 0),
    waiversSigned: Number(pax[0]?.signed ?? 0),
  };
}

// TRIPS W1.3 ▸ ข้อเท็จจริงของก้อน "จัดการการจอง" (ใบสั่ง W1.3 §3.2 §4 · อ่านอย่างเดียว) — ผู้เรียก (platform/trips-self · trips-book) ใช้ตัดสิน
//   ไม่ออก VM: เบอร์ผู้จอง (phoneNorm) ใช้เทียบในเซิร์ฟเวอร์เท่านั้น · ข้อมูลผู้จองถูกลบ (piiPurgedAt) ⇒ ไม่มีเบอร์ · คำขอคืนเงิน = แถวล่าสุดที่ไม่ถูกถอน (P3 · K8) ◂
export type BookSelfFacts = {
  channel: string;
  collectMode: string;
  agentAccountId: string | null;
  version: number;
  bookerPhoneNorm: string | null;
  refund: { status: string; amountSatang: number; by: string } | null;
  /** ยกเลิกแล้วโดยเส้นลูกค้า (audit trips.booking.cancel ของ trips.public.self · V2) */
  cancelledBySelf: boolean;
};
export async function findBookSelfFacts(ref: { tenantId: string; unitId: string }, bookingId: string): Promise<BookSelfFacts | null> {
  if (!isId(bookingId) || !isId(ref.unitId)) return null;
  const { tenantId, unitId } = ref;
  const db = dbOf(tenantId, unitId);
  const rows = await db.$queryRaw<{ channel: string; collectMode: string; agentAccountId: string | null; version: number; purged: boolean; phoneNorm: string | null; self: boolean }[]>`
    SELECT b."channel", b."collectMode", b."agentAccountId", b."version", (b."piiPurgedAt" IS NOT NULL) AS "purged", p."phoneNorm",
      b."policySnapshot"->'booker' AS "typed",
      (b."status" = 'CANCELLED' AND EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."tenantId" = b."tenantId" AND a."createdAt" >= b."createdAt" - interval '1 day' AND a."targetId" = b."id" AND a."action" = 'trips.booking.cancel' AND a."actorId" = 'trips.public.self')) AS "self"
    FROM "TripBooking" b LEFT JOIN "Party" p ON p."id" = b."bookerPartyId" AND p."tenantId" = b."tenantId"
    WHERE b."id" = ${bookingId} AND b."tenantId" = ${tenantId} AND b."unitId" = ${unitId} LIMIT 1`;
  const b = rows[0];
  if (!b) return null;
  const rq = await db.$queryRaw<{ status: string; amountSatang: number; by: string }[]>`
    SELECT "status", "amountSatang", "by" FROM "TripRefundRequest" WHERE "bookingId" = ${bookingId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "status" <> 'WITHDRAWN'
    ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`;
  const r = rq[0];
  const typed = typedBookerOf((b as Record<string, unknown>).typed), typedPhone = normalizePartyPhone(typed?.phone);
  return {
    channel: String(b.channel),
    collectMode: String(b.collectMode),
    agentAccountId: b.agentAccountId ?? null,
    version: Number(b.version),
    // TRIPS W1.2b ▸ ถูกลบ ⇒ null ก่อนทุกอย่าง · มีคีย์ booker ⇒ เบอร์ที่พิมพ์ที่ใช้ได้ (เลขสำคัญ ≥ 8) เท่านั้น ไม่งั้น null (ป้ายลบด้วย) ·
    //   ไม่มีคีย์ ⇒ เบอร์ของ Party แบบเดิม (ใบสั่ง W1.2b §3.4 · มติ E2 E7 E9 แทน C-3) ◂
    bookerPhoneNorm: b.purged ? null : typed ? (bookerPhoneKey(typedPhone) ? typedPhone : null) : typeof b.phoneNorm !== "string" || !b.phoneNorm ? null : b.phoneNorm,
    refund: r ? { status: String(r.status), amountSatang: Number(r.amountSatang), by: String(r.by) } : null,
    cancelledBySelf: b.self === true,
  };
}
/** ผลเดิมของคีย์ฟอร์มลูกค้า (K5 · คีย์อย่างเดียว): คำขอคืนเงินของคีย์ หรือแถว audit ยกเลิกที่จด idemKeyHash (ช่วงเผื่อ 24 ชม. ก่อนเวลาสร้างการจอง แบบ T0.6 F1) — ไม่เคยทำ ⇒ null */
export async function findSelfReplay(ref: { tenantId: string; unitId: string }, b: { id: string; createdAt: Date }, key: string, keyHash: string): Promise<{ request: { id: string; status: string; amountSatang: number; keptSatang: number; step: { daysBefore: number; refundBp: number } | null } | null } | null> {
  const db = dbOf(ref.tenantId, ref.unitId);
  const rq = (await db.$queryRaw<{ id: string; status: string; amountSatang: number; computed: unknown }[]>`
    SELECT "id", "status", "amountSatang", "computed" FROM "TripRefundRequest" WHERE "tenantId" = ${ref.tenantId} AND "idempotencyKey" = ${key} AND "bookingId" = ${b.id}`)[0];
  if (rq) {
    const cp = isRec(rq.computed) ? rq.computed : {};
    const step = isRec(cp.step) ? { daysBefore: Number(cp.step.daysBefore), refundBp: Number(cp.step.refundBp) } : null;
    return { request: { id: rq.id, status: rq.status, amountSatang: Number(rq.amountSatang), keptSatang: Number(cp.keptSatang ?? 0), step } };
  }
  const since = new Date(new Date(b.createdAt).getTime() - 86_400_000).toISOString();
  const a = await db.$queryRaw<{ x: number }[]>`
    SELECT 1 AS "x" FROM "AuditLog" WHERE "tenantId" = ${ref.tenantId} AND "createdAt" >= ${since}::timestamp AND "targetId" = ${b.id} AND "action" = 'trips.booking.cancel' AND "after"->>'idemKeyHash' = ${keyHash} LIMIT 1`;
  return a.length ? { request: null } : null;
}
