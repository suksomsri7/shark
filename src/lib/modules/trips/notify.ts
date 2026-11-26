// ─────────────────────────────────────────────────────────────
// trips/notify.ts — ข้อความถึงลูกค้าทริปผ่านประตู notifyCustomer · RUN TRIPS T1.8a (ใบสั่ง ledger/trips-briefs/T1.8.md §4)
//   notifyTripBooking: ตัวกรองก่อน claim (ไม่เขียนแถว) → ผู้รับ (R1) → ตัวแปร th/en → ประตู (claim · เวลาเงียบ · precheck ถาวร R4 · LINE)
//   onTripsNotifyEvent: consumer trips.booking.confirmed · trips.payment.due_soon (ไม่ throw · event อื่นไม่ทำอะไร)
//   tripsReminderScan / tripsRetryScan: ขั้นของงาน trips.customerMessages (jobs.ts) · tripBookingMessages: รายการข้อความต่อการจอง (R10)
// 🔴 ส่งผ่าน notifyCustomer เท่านั้น · ไม่ส่ง input.link (เติม {ลิงก์} เอง) · ทาง ก ส่ง chatContactId อย่างเดียว · ทาง ข ส่ง partyId อย่างเดียว
// 🔴 ห้ามจับคู่ Party จากเบอร์/อีเมลที่พิมพ์ (R1) · ไม่ log ชื่อ/เบอร์/ข้อความ/token · ServiceMessageLog อ่านด้วย dedupeKey IN เท่านั้น
// 🔴 สวิตช์ T69 ปิด ⇒ ไม่แตะ ServiceMessageLog และไม่เรียกประตู (R5) · ชนิดนอก a (T1.8b ฯลฯ) ⇒ BAD_STATE
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { resolveSettings } from "@/lib/core/settings";
import { resolveCanonical } from "@/lib/modules/party";
import { notifyCustomer } from "@/lib/platform/notify-customer";
import { bookingPublicToken } from "./booking";
import { addDaysYmd, normalizeTimezone, utcToLocal } from "./departures-core";
import { pickupFactsOf } from "./manifest";
import {
  CONFIRM_BYPASS_QUIET_MS, TRIPS_STAFF_CHANNELS, checkTripsMsgTemplate, isTripsMsgKindA, msgEligibility, reminderWindow, templateUses, tripsMsgKey, tripsMsgVars,
  type TripsMsgKindA, type TripsPreGateStatus,
} from "./notify-core";

export type TripsNotifyOutcome = { kind: string; status: string; dedupeKey: string | null; duplicate: boolean; retryAt: Date | null };
type Ctx = { tenantId: string; unitId: string };
type Ctl = { signal?: AbortSignal; deadline?: number };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const validNow = (d: unknown): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
const outOf = (kind: string, status: TripsPreGateStatus | "FAILED", dedupeKey: string | null = null): TripsNotifyOutcome => ({ kind, status, dedupeKey, duplicate: false, retryAt: null });
export const tripsOutOfBudget = (c: Ctl) => c.signal?.aborted === true || (typeof c.deadline === "number" && Date.now() >= c.deadline);
/** แถวที่ประตูไม่ส่งซ้ำ (สถานะจบ) */
export const tripsFinalRow = (s: string) => ["SENT", "SKIPPED_CONSENT", "NO_CHANNEL", "QUOTA"].includes(s) || s.startsWith("SKIPPED_PRECHECK_");
/** ลองซ้ำแถว FAILED ห่างกัน ≥ 60 นาที (R10) */
const RETRY_GAP_MS = 60 * 60_000;
const OPEN_REFUND = "('REQUESTED', 'QUOTED', 'APPROVED', 'EXECUTING', 'FAILED')";

type Facts = {
  id: string; code: string; status: string; productId: string; departureId: string; travelDate: string; channel: string; agentAccountId: string | null;
  collectMode: string; bookerPartyId: string | null; currency: string; createdAt: Date; erased: boolean; agencyWho: string | null; agentTierId: string | null;
  depCancelled: boolean; openRefund: boolean; title: unknown; meetingPoint: unknown; shopName: string; shopSlug: string; unitSettings: unknown;
  dueStatus: string | null; dueOutstanding: number | null; dueAt: Date | null;
};
/** ข้อเท็จจริงของการจองคิวรีเดียว (การจอง · สินค้า · รอบ · ร้าน · หน่วย TRIPS · คำขอคืนเงินเปิด · งวดสด) — ร้าน/หน่วยอื่น ⇒ null */
async function factsOf(ctx: Ctx, bookingId: string, dueId: string | null): Promise<Facts | null> {
  const rows = await tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }).$queryRawUnsafe<Facts[]>(
    `SELECT b."id", b."code", b."status", b."productId", b."departureId", to_char(b."travelDate", 'YYYY-MM-DD') AS "travelDate", b."channel", b."agentAccountId",
       b."collectMode", b."bookerPartyId", b."currency", b."createdAt",
       (b."piiPurgedAt" IS NOT NULL OR b."bookerPartyId" IS NULL OR COALESCE(b."policySnapshot"->'booker'->>'erased', '') = 'true') AS "erased",
       b."policySnapshot"->'policy'->'agency'->'values'->>'agency.crm.whoMessagesCustomer' AS "agencyWho", b."policySnapshot"->'refs'->>'agentTierId' AS "agentTierId",
       (d."status" = 'CANCELLED') AS "depCancelled",
       EXISTS (SELECT 1 FROM "TripRefundRequest" r WHERE r."tenantId" = b."tenantId" AND r."bookingId" = b."id" AND r."status" IN ${OPEN_REFUND}) AS "openRefund",
       p."title", p."meetingPoint", t."name" AS "shopName", t."slug" AS "shopSlug", u."settings" AS "unitSettings",
       pd."status" AS "dueStatus", (pd."amountSatang" - pd."paidSatang")::int AS "dueOutstanding", pd."dueAt"
     FROM "TripBooking" b
     JOIN "TripProduct" p ON p."id" = b."productId" AND p."tenantId" = b."tenantId"
     JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
     JOIN "BusinessUnit" u ON u."id" = b."unitId" AND u."tenantId" = b."tenantId" AND u."type" = 'TRIPS'
     JOIN "Tenant" t ON t."id" = b."tenantId"
     LEFT JOIN "TripPaymentDue" pd ON pd."id" = $4::text AND pd."tenantId" = b."tenantId" AND pd."bookingId" = b."id"
     WHERE b."tenantId" = $1 AND b."unitId" = $2 AND b."id" = $3 LIMIT 1`,
    ctx.tenantId, ctx.unitId, bookingId, dueId,
  );
  return rows[0] ?? null;
}
const tzOf = (f: Facts) => normalizeTimezone(isRec(f.unitSettings) ? f.unitSettings.timezone : null);

/** A32: ใครส่งข้อความหาลูกค้าของเอเจนซี่ — snapshot ก่อน · ไม่มี ⇒ ค่าสดชั้น AGENT */
async function agencyWhoOf(ctx: Ctx, f: Facts): Promise<string | null> {
  if (!f.agentAccountId) return null;
  if (f.agencyWho) return f.agencyWho;
  const key = "agency.crm.whoMessagesCustomer";
  const S = await resolveSettings({ tenantId: ctx.tenantId }, [key], { unitId: ctx.unitId, productId: f.productId, agentId: f.agentAccountId, ...(f.agentTierId ? { agentTierId: f.agentTierId } : {}) });
  return typeof S[key]?.value === "string" ? (S[key].value as string) : null;
}

/** ผู้รับ (R1): ทาง ก = ผู้ติดต่อจากรหัสผูก TRIP_BOOKING ของการจองนี้ (Party ของผู้ติดต่อต้องไม่ใช่คนอื่น) · ทาง ข = Party (ตัวหลัก) เฉพาะช่องทางพนักงาน */
async function recipientOf(ctx: Ctx, f: Facts): Promise<{ chatContactId: string } | { partyId: string } | null> {
  const linked = await tenantDb({ tenantId: ctx.tenantId }).$queryRawUnsafe<{ id: string; partyId: string | null }[]>(
    `SELECT c."id", c."partyId" FROM "ChatLinkCode" l JOIN "ChatContact" c ON c."id" = l."usedByChatContactId" AND c."tenantId" = l."tenantId"
     WHERE l."tenantId" = $1 AND l."purpose" = 'TRIP_BOOKING' AND l."refId" = $2 AND l."usedAt" IS NOT NULL ORDER BY l."usedAt" DESC, l."id" DESC LIMIT 5`,
    ctx.tenantId, f.id,
  );
  let booker: string | null = null;
  const bookerCanon = async () => (booker ??= f.bookerPartyId ? await resolveCanonical(ctx.tenantId, f.bookerPartyId) : "");
  for (const c of linked) {
    if (!c.partyId || !f.bookerPartyId || c.partyId === f.bookerPartyId) return { chatContactId: c.id };
    if ((await resolveCanonical(ctx.tenantId, c.partyId)) === (await bookerCanon())) return { chatContactId: c.id };
  }
  if (TRIPS_STAFF_CHANNELS.includes(f.channel) && f.bookerPartyId) return { partyId: await bookerCanon() };
  return null;
}

function appOrigin(): string {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ค่าเพี้ยน — ลองตัวถัดไป */
    }
  }
  return "";
}

export type TripsNotifyInput = { bookingId: string; kind: string; departureId?: string; travelDate?: string; dueId?: string; eventId?: string };
/** precheck หลัง claim (R4) — ยับยั้งเฉพาะข้อเท็จจริงถาวร ⇒ SKIPPED_PRECHECK_<เหตุ> · ตัวกั้นชั่วคราวอยู่ก่อน claim เท่านั้น */
function precheckOf(ctx: Ctx, kind: TripsMsgKindA, i: TripsNotifyInput, key: { departureId: string; travelDate: string }, window: { to: Date } | null, now: Date) {
  return async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const f = await factsOf(ctx, i.bookingId, kind === "paymentDue" ? (i.dueId ?? null) : null);
    const ok = kind === "paymentDue" ? ["CONFIRMED", "PART_PAID"] : ["CONFIRMED", "PART_PAID", "PAID"];
    if (!f || !ok.includes(f.status)) return { ok: false, reason: "STATUS" };
    if (f.erased) return { ok: false, reason: "ERASED" };
    if (f.depCancelled) return { ok: false, reason: "DEP_CANCELLED" };
    if (kind === "reminder1Day") {
      if (f.departureId !== key.departureId || f.travelDate !== key.travelDate) return { ok: false, reason: "MOVED" };
      if (!window || now.getTime() >= window.to.getTime()) return { ok: false, reason: "TOO_LATE" };
    }
    if (kind === "paymentDue") {
      if (!f.dueStatus || !["OPEN", "PARTLY_PAID"].includes(f.dueStatus) || (f.dueOutstanding ?? 0) <= 0) return { ok: false, reason: "PAID" };
      if (!f.dueAt || now.getTime() >= f.dueAt.getTime()) return { ok: false, reason: "TOO_LATE" };
    }
    return { ok: true };
  };
}

/** ส่งข้อความชนิด a ของการจองหนึ่งรายการ (ไม่ throw) — สถานะก่อนประตู: DISABLED BAD_STATE NO_RECIPIENT AGENCY_RULE HELD NOT_FOUND */
export async function notifyTripBooking(ctx: Ctx, i: TripsNotifyInput, opts?: { now?: Date }): Promise<TripsNotifyOutcome> {
  const kind = String(i?.kind ?? "");
  if (!isTripsMsgKindA(kind)) return outOf(kind, "BAD_STATE");
  if (!ctx || !isStr(ctx.tenantId) || !isStr(ctx.unitId) || !isStr(i?.bookingId)) return outOf(kind, "NOT_FOUND");
  const now = validNow(opts?.now);
  try {
    const f = await factsOf(ctx, i.bookingId, kind === "paymentDue" && isStr(i.dueId) ? i.dueId : null);
    if (!f) return outOf(kind, "NOT_FOUND");
    const tplKey = `trips.msg.${kind}`;
    const S = await resolveSettings({ tenantId: ctx.tenantId }, ["trips.msg.enabled", tplKey], { unitId: ctx.unitId, productId: f.productId });
    const en = S["trips.msg.enabled"]?.value;
    if (!isRec(en) || en[kind] !== true) return outOf(kind, "DISABLED");
    const departureId = kind === "reminder1Day" && isStr(i.departureId) ? i.departureId : f.departureId;
    const travelDate = kind === "reminder1Day" && isStr(i.travelDate) ? i.travelDate : f.travelDate;
    const key = tripsMsgKey(kind, { bookingId: f.id, departureId, travelDate, dueId: i.dueId, eventId: i.eventId });
    if (!key) return outOf(kind, "BAD_STATE");
    const tz = tzOf(f);
    const window = kind === "reminder1Day" ? reminderWindow(travelDate, tz) : null;
    const due = f.dueStatus && f.dueAt ? { status: f.dueStatus, outstandingSatang: f.dueOutstanding ?? 0, dueAt: f.dueAt } : null;
    const bad = msgEligibility(kind, { ...f, agencyWho: await agencyWhoOf(ctx, f), window, due }, now);
    if (bad) return outOf(kind, bad, key);
    const rcpt = await recipientOf(ctx, f);
    if (!rcpt) return outOf(kind, "NO_RECIPIENT", key);
    // ด่านแม่แบบตอนส่ง (R9): แม่แบบที่มีผลไม่ผ่าน ⇒ ข้อความมาตรฐาน + WARN (ไม่มีข้อความแม่แบบใน log)
    const tpl = S[tplKey]?.value;
    const standard = !checkTripsMsgTemplate(kind, tpl).ok;
    if (standard) await logOps("WARN", "trips.notify", `แม่แบบ ${tplKey} ไม่ผ่านด่าน — ส่งข้อความมาตรฐานแทน`, { tenantId: ctx.tenantId, detail: `unit=${ctx.unitId}` });
    const needPickup = !standard && (templateUses(tpl, "เวลารับ") || templateUses(tpl, "จุดนัด"));
    const usePickup = kind === "reminder1Day" || needPickup;
    const pickup = usePickup ? (await pickupFactsOf({ db: tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId }), tenantId: ctx.tenantId, unitId: ctx.unitId }, f.departureId)).get(f.id) : null;
    const token = bookingPublicToken(f.id);
    const link = token ? `${appOrigin()}/book/${f.shopSlug}/my/${token}` : "";
    const base = { shopName: f.shopName, code: f.code, productTitle: f.title, meetingPoint: f.meetingPoint, travelDate, tz, link, pickup, outstandingSatang: due?.outstandingSatang ?? null, dueAt: due?.dueAt ?? null };
    const r = await notifyCustomer(
      { tenantId: ctx.tenantId },
      {
        unitId: ctx.unitId,
        domain: "trips",
        messageKey: kind,
        ...rcpt,
        vars: tripsMsgVars(base, "th"),
        localized: { en: { vars: tripsMsgVars(base, "en") } },
        scope: { productId: f.productId },
        ...(standard ? { standardText: true } : {}),
        dedupeKey: key,
        at: now,
        bypassQuiet: kind === "confirmation" && now.getTime() - f.createdAt.getTime() <= CONFIRM_BYPASS_QUIET_MS,
        precheck: precheckOf(ctx, kind, i, { departureId, travelDate }, window, now),
      },
    );
    const status = r.precheckFailed !== undefined ? `SKIPPED_PRECHECK_${r.precheckFailed || "ERROR"}` : r.code === "QUOTA" ? "QUOTA" : r.status;
    return { kind, status, dedupeKey: key, duplicate: r.duplicate === true, retryAt: r.retryAt ?? null };
  } catch (e) {
    console.error(`[trips.notify] ${kind} ล้ม`, e instanceof Error ? e.name : "error");
    return outOf(kind, "FAILED");
  }
}

/** consumer: trips.booking.confirmed ⇒ confirmation · trips.payment.due_soon ⇒ paymentDue (กุญแจมี evt.id · R3) · อื่น ⇒ ไม่ทำอะไร · ไม่ throw */
export async function onTripsNotifyEvent(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId?: string | null }): Promise<void> {
  try {
    const p = isRec(evt?.payload) ? evt.payload : {};
    const unitId = isStr(evt?.unitId) ? evt.unitId : isStr(p.unitId) ? p.unitId : "";
    if (!isStr(evt?.tenantId) || !unitId || !isStr(p.bookingId)) return;
    const ctx = { tenantId: evt.tenantId, unitId };
    if (evt.type === "trips.booking.confirmed") await notifyTripBooking(ctx, { bookingId: p.bookingId, kind: "confirmation" });
    else if (evt.type === "trips.payment.due_soon" && isStr(p.dueId) && isStr(evt.id)) await notifyTripBooking(ctx, { bookingId: p.bookingId, kind: "paymentDue", dueId: p.dueId, eventId: evt.id });
  } catch (e) {
    console.error(`[trips.notify] event ${String(evt?.type).slice(0, 40)} ล้ม`, e instanceof Error ? e.name : "error");
  }
}

// ───────────────────────── ขั้นของงาน trips.customerMessages ─────────────────────────
type LogRow = { dedupeKey: string; status: string; at: Date };
/** แถว log ของกุญแจตรงตัว (tenantId + dedupeKey IN · คิวรีเดียว) */
async function logRowsOf(ctx: Ctx, keys: string[]): Promise<Map<string, LogRow>> {
  if (!keys.length) return new Map();
  const rows = await tenantDb(ctx).serviceMessageLog.findMany({ where: { tenantId: ctx.tenantId, dedupeKey: { in: keys } }, select: { dedupeKey: true, status: true, at: true } });
  return new Map(rows.map((r) => [r.dedupeKey, r]));
}
/** ควรเรียกประตูไหม: ไม่มีแถว (เฉพาะงานเตือน) · SKIPPED_QUIET · FAILED ที่ห่าง ≥ 60 นาที */
const shouldCall = (row: LogRow | undefined, now: Date, firstOk: boolean) =>
  !row ? firstOk : row.status === "SKIPPED_QUIET" || (row.status === "FAILED" && row.at.getTime() <= now.getTime() - RETRY_GAP_MS);
const PAGE = 200;

/** reminder1Day ของหน่วย: เวลาหน่วยอยู่ในหน้าต่าง (≥ 17:00 วันก่อน) ⇒ การจองของวันพรุ่งนี้ (หน้าละ 200) · คืน [ส่งใหม่, ล้ม, ยังเหลือ] */
export async function tripsReminderScan(ctx: Ctx, tzRaw: unknown, now: Date, ctl: Ctl): Promise<{ sent: number; failed: number; more: boolean }> {
  const tz = normalizeTimezone(tzRaw);
  const ymd = addDaysYmd(utcToLocal(tz, now).ymd, 1);
  const w = reminderWindow(ymd, tz);
  const out = { sent: 0, failed: 0, more: false };
  if (now.getTime() < w.from.getTime() || now.getTime() >= w.to.getTime()) return out;
  const db = tenantDb(ctx);
  let cursor: string | null = null;
  for (;;) {
    if (tripsOutOfBudget(ctl)) return { ...out, more: true };
    const rows: { id: string; departureId: string }[] = await db.tripBooking.findMany({
      where: { tenantId: ctx.tenantId, unitId: ctx.unitId, status: { in: ["CONFIRMED", "PART_PAID", "PAID"] }, travelDate: new Date(`${ymd}T00:00:00.000Z`), createdAt: { lt: w.from }, channel: { not: "OTA" }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, departureId: true }, orderBy: { id: "asc" }, take: PAGE,
    });
    const keyed = rows.map((r) => ({ ...r, key: tripsMsgKey("reminder1Day", { bookingId: r.id, departureId: r.departureId, travelDate: ymd }) ?? "" })).filter((r) => r.key);
    const log = await logRowsOf(ctx, keyed.map((r) => r.key));
    for (const r of keyed) {
      if (!shouldCall(log.get(r.key), now, true)) continue;
      if (tripsOutOfBudget(ctl)) return { ...out, more: true };
      const x = await notifyTripBooking(ctx, { bookingId: r.id, kind: "reminder1Day", departureId: r.departureId, travelDate: ymd }, { now });
      if (x.status === "SENT" && !x.duplicate) out.sent++;
      else if (x.status === "FAILED") out.failed++;
    }
    if (rows.length < PAGE) return out;
    cursor = rows[rows.length - 1].id;
  }
}

const RETRY_TYPES = { "trips.booking.confirmed": "confirmation", "trips.payment.due_soon": "paymentDue" } as const;
/**
 * ลองซ้ำ (R10): ที่มาของกุญแจ = OutboxEvent ของร้าน (confirmed · due_soon) ที่ createdAt ∈ [now − 48 ชม., now] ⇒ กุญแจตรงตัว ⇒ log IN ⇒
 * เรียกซ้ำเฉพาะ SKIPPED_QUIET / FAILED ห่าง ≥ 60 นาที · ไม่มีแถว ⇒ ไม่เริ่มครั้งแรก · `kindsOf(unitId)` = ชนิดที่หน่วยเปิด (ผู้เรียกตัดหน่วยในเวลาเงียบออกแล้ว)
 */
export async function tripsRetryScan(tenantId: string, kindsOf: (unitId: string) => readonly string[], now: Date, ctl: Ctl): Promise<{ sent: number; failed: number; more: boolean }> {
  const out = { sent: 0, failed: 0, more: false };
  const evts = await tenantDb({ tenantId }).outboxEvent.findMany({
    where: { tenantId, type: { in: Object.keys(RETRY_TYPES) }, createdAt: { gte: new Date(now.getTime() - 48 * 3_600_000), lte: now } },
    select: { id: true, type: true, unitId: true, payload: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1000,
  });
  const byUnit = new Map<string, { input: TripsNotifyInput; key: string }[]>();
  for (const e of evts) {
    const p = isRec(e.payload) ? e.payload : {};
    const unitId = isStr(e.unitId) ? e.unitId : isStr(p.unitId) ? p.unitId : "";
    const kind = RETRY_TYPES[e.type as keyof typeof RETRY_TYPES];
    if (!unitId || !isStr(p.bookingId) || !kindsOf(unitId).includes(kind)) continue;
    const input: TripsNotifyInput = kind === "paymentDue" ? { bookingId: p.bookingId, kind, dueId: isStr(p.dueId) ? p.dueId : "", eventId: e.id } : { bookingId: p.bookingId, kind };
    const key = tripsMsgKey(kind, input);
    if (key) byUnit.set(unitId, [...(byUnit.get(unitId) ?? []), { input, key }]);
  }
  for (const [unitId, list] of byUnit) {
    const ctx = { tenantId, unitId };
    const log = await logRowsOf(ctx, [...new Set(list.map((x) => x.key))]);
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.key) || !shouldCall(log.get(x.key), now, false)) continue;
      seen.add(x.key);
      if (tripsOutOfBudget(ctl)) return { ...out, more: true };
      const r = await notifyTripBooking(ctx, x.input, { now });
      if (r.status === "SENT" && !r.duplicate) out.sent++;
      else if (r.status === "FAILED") out.failed++;
    }
  }
  return out;
}

// ───────────────────────── รายการข้อความต่อการจอง (ลิ้นชัก · R10) ─────────────────────────
export type TripBookingMessage = { kind: string; at: string; status: string; fallback: boolean };
/**
 * กุญแจตรงตัวของการจอง (confirmation · reminder1Day ของรอบ/วันปัจจุบัน · paymentDue จาก OutboxEvent due_soon ของการจองนี้) ⇒ log IN คิวรีเดียว
 * fallback = แม่แบบที่มีผล ณ ตอนนี้ไม่ผ่านด่าน (ส่งข้อความมาตรฐานแทน) · ไม่มีแถว = ไม่แสดง
 */
export async function tripBookingMessages(ctx: Ctx, b: { id: string; productId: string; departureId: string; travelDate: string }): Promise<TripBookingMessage[]> {
  const evts = await tenantDb({ tenantId: ctx.tenantId }).outboxEvent.findMany({
    where: { tenantId: ctx.tenantId, type: "trips.payment.due_soon", payload: { path: ["bookingId"], equals: b.id } },
    select: { id: true, payload: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50,
  });
  const keys: [string, string | null][] = [
    ["confirmation", tripsMsgKey("confirmation", { bookingId: b.id })],
    ["reminder1Day", tripsMsgKey("reminder1Day", { bookingId: b.id, departureId: b.departureId, travelDate: b.travelDate })],
    ...evts.map((e): [string, string | null] => ["paymentDue", tripsMsgKey("paymentDue", { bookingId: b.id, dueId: isRec(e.payload) && isStr(e.payload.dueId) ? e.payload.dueId : "", eventId: e.id })]),
  ];
  const kindOf = new Map(keys.filter((k): k is [string, string] => !!k[1]).map(([k, key]) => [key, k]));
  const log = await logRowsOf(ctx, [...kindOf.keys()]);
  if (!log.size) return [];
  const kinds = [...new Set([...log.keys()].map((k) => kindOf.get(k) ?? ""))].filter(Boolean);
  const S = await resolveSettings({ tenantId: ctx.tenantId }, kinds.map((k) => `trips.msg.${k}`), { unitId: ctx.unitId, productId: b.productId });
  const fb = new Map(kinds.map((k) => [k, !checkTripsMsgTemplate(k, S[`trips.msg.${k}`]?.value).ok]));
  return [...log.values()]
    .sort((x, y) => x.at.getTime() - y.at.getTime())
    .map((r) => ({ kind: kindOf.get(r.dedupeKey) ?? "", at: r.at.toISOString(), status: r.status, fallback: fb.get(kindOf.get(r.dedupeKey) ?? "") === true }));
}
