// SVC H.10 ▸ ARI ขาออก (availability · rates · restrictions) — ใบสั่ง ledger/svc-briefs/svc-brief-h.10.md §0 · §2 ข้อ 3–5 · §9.7 · §9.10 · §10.2/8/9/10
//   เส้น: เหตุที่กระทบห้องว่าง/ราคา ⇒ outbox channel.ari.dirty {unitId, roomTypeIds, from, to} (รวมสองปลาย · วันไทย)
//         → onAriDirty รวมชุด: PENDING 1 แถวต่อ (ตัวต่อ, หน่วย) ต่อช่วงที่ทับ/ติดกัน (ตัดหัววันนี้ · ตัดท้าย ariHorizonDays · แถวเก่าที่ถูกแทน = SUPERSEDED)
//         → pushAriJobs (งานรายนาที channel-ari-push) สร้าง ARI ใหม่จากข้อมูลสด · hash เท่างานที่ส่งล่าสุดช่วงเดียวกัน ⇒ SUPERSEDED (ไม่เรียกตัวต่อ)
//           · ส่งผ่าน callIntegration เสมอ · ล้ม ⇒ attempts+1 · backoff 1·2·4·8 นาที (updatedAt + 2^(attempts−1)) · ครบ 5 ⇒ FAILED + channel.ari.failed
//   • ARI ต่อวัน/ห้องที่แม็ป = { available: max(0, hotelAvailability − buffer), rates: {ext: {priceSatang: markupPrice(ราคาแผน), minNights, closedToArrival}}, stopSell }
//     ห้องว่าง = สูตรเดียวของโรงแรม (hotelAvailability) · ราคา = loadPricingContext + resolveNightPrice ของ H.1 (ไม่คิดราคาเอง) · ไม่มีราคา ⇒ ไม่มีแผนนั้น · ไม่มีแผนเลย/ว่าง 0 ⇒ stopSell
//     buffer: ChannelInventoryBuffer ชนะ · ไม่มีแถว ⇒ rooms.hotel.ota.buffer (ประเภท) · markup: formula.markupBp ชนะ · null ⇒ rooms.hotel.ota.markupBp (แผน)
//   • คิวรีไม่โตตามจำนวนวัน (ไม่มี N+1 · ช่วง ≤ 366 วัน = ก้อนเดียว) · ไม่มีข้อมูลแขก (X10) · ตัวต่อ DISABLED ⇒ ไม่ส่ง
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox, emitOutboxOutsideTx } from "@/lib/core/outbox";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { callIntegration, integrationHandleForRow, type IntegrationHandle } from "@/lib/core/integrations";
import { hotelAvailability } from "../availability";
import { loadPricingContext } from "../rates";
import { isYmd, resolveNightPrice, resolveSeason } from "../pricing";
import { ariHash, datesInclusive, markupPrice, ymdAdd, ymdDayNo, type AriDay, type AriPayload, type ChannelMapping } from "./types";
import { ARI_MAX_HORIZON, CHANNEL_KIND, R, connectionById, covers, dbDate, fail, isRec, isStr, loadMappings, scanDb, ymdOfDb, type ChannelFail, type ConnectionRow } from "./mapping";

type Tx = Prisma.TransactionClient;
const KEY = {
  markup: "rooms.hotel.ota.markupBp",
  buffer: "rooms.hotel.ota.buffer",
  minNights: "rooms.hotel.minNights",
  cta: "rooms.hotel.closedToArrival",
  horizon: "rooms.hotel.ota.ariHorizonDays",
} as const;
const DEFAULT_MARKUP_BP = 1500;
const DEFAULT_HORIZON = 365;
/** ช่วงต่อก้อนการคำนวณ (hotelAvailability/loadPricingContext รับ ≤ 400 วัน) */
const CHUNK_DAYS = 366;
export const ARI_MAX_ATTEMPTS = 5;
const PUSH_BATCH = 100;
const ACTIVE_CONN = ["CONNECTED", "ERROR"];
/** รอบ full resync ARI ต่อ (ตัวต่อ, หน่วย) — ค่าคงที่ในโค้ด (รอบ 3 ผู้ตรวจ B · RB-6/RB-7) */
export const ARI_RESYNC_EVERY_MS = 6 * 3_600_000;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);

// ───────────────────────── dirty ─────────────────────────
export type AriDirtyInput = { unitId: string; roomTypeIds?: string[]; from?: string | null; to?: string | null };

/**
 * ยิง channel.ari.dirty (ตัวยิงจาก rates.ts/block.ts/แม็ป — §9.10)
 * • tx ส่งมา ⇒ transactional outbox: เขียนใน tx เดียวกับงาน (งานย้อน = ไม่มี dirty) และ **ไม่กลืนข้อผิดพลาด** — คิวรีที่ล้มใน tx ของ Postgres
 *   ทำให้ทั้ง tx abort อยู่แล้ว (คิวรีถัดไป/commit ล้มต่อ) ⇒ ปล่อย throw ให้งานล้มตรง ๆ ที่ต้นเหตุ ดีกว่ากลืนแล้วไปล้มเงียบที่ commit (มติรอบ 2 · ผู้ตรวจ A)
 * • ไม่ส่ง tx ⇒ นอก tx: ล้ม = เตือนใน log ไม่ throw (ARI ตามรอบถัดไป · ไม่มี tx ให้เสีย)
 * ร้านที่ไม่มีตัวต่อ CHANNEL_MANAGER ⇒ ไม่ยิง (ตัวที่ถอดอยู่ยังยิง — งานค้างไว้ส่งตอนต่อกลับ · รอบ 3) · from/to ไม่ส่ง ⇒ วันนี้ → +400 (ผู้รวมชุดตัดตาม ariHorizonDays)
 */
export async function emitAriDirty(ctx: { tenantId: string }, input: AriDirtyInput, tx?: object): Promise<void> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(input) || !isStr(input.unitId)) return;
  const today = bkkYmd(new Date());
  const from = isYmd(input.from) ? input.from : today;
  const to = isYmd(input.to) ? input.to : ymdAdd(today, ARI_MAX_HORIZON);
  const ev = {
    tenantId: ctx.tenantId,
    unitId: input.unitId,
    type: "channel.ari.dirty",
    idempotencyKey: `channel.ari.dirty#${randomUUID()}`,
    payload: { unitId: input.unitId, roomTypeIds: (input.roomTypeIds ?? []).filter(isStr), from: from <= to ? from : to, to: from <= to ? to : from },
  };
  // ทุกสถานะ (รวม DISABLED) — งานที่รวมชุดไว้ระหว่างถอดค้าง PENDING (pushAriJobs ไม่ส่งตัวที่ถอด) ⇒ ต่อกลับแล้วส่งทันที (RB-6)
  const where = { tenantId: ctx.tenantId, kind: CHANNEL_KIND };
  if (tx) {
    const t = tx as Tx;
    if ((await t.tenantIntegration.count({ where })) === 0) return;
    await emitOutbox(t, ev);
    return;
  }
  try {
    if ((await tenantDb({ tenantId: ctx.tenantId }).tenantIntegration.count({ where })) === 0) return;
    await emitOutboxOutsideTx(ev);
  } catch {
    console.warn("[hotel.channel] ยิง channel.ari.dirty ไม่สำเร็จ — ARI จะตามรอบถัดไป");
  }
}

type EvtLike = { tenantId: string; type?: string; payload: unknown; unitId?: string | null };

/** ช่วงเพดานของหน่วย (ariHorizonDays · ค่าเริ่ม 365) */
async function horizonOf(tenantId: string, unitId: string): Promise<number> {
  const st = await resolveSettings({ tenantId }, [KEY.horizon], { unitId });
  const v = num(st[KEY.horizon]?.value);
  return v !== null && v >= 1 ? Math.min(v, ARI_MAX_HORIZON) : DEFAULT_HORIZON;
}

export type EnqueueOpts = {
  /** เฉพาะตัวต่อเหล่านี้ (full resync ต่อตัวต่อ) */
  connectionIds?: string[];
  /** full resync: มีงานของ (ตัวต่อ, หน่วย) ที่ครอบช่วงนี้สร้างภายใน freshMs แล้ว (สถานะใดก็ได้) ⇒ ไม่สร้างซ้ำ (ตรวจใต้ advisory lock = lease ต่อคู่) */
  freshMs?: number;
};

/**
 * รวมชุดงาน ARI ของทุกตัวต่อที่ครอบหน่วย (ทุกสถานะ — ตัวที่ถอดอยู่ได้งานค้างไว้ · pushAriJobs ส่งเฉพาะ CONNECTED/ERROR · มีแม็ปห้องของหน่วย) — คืนจำนวนตัวต่อที่มีงานใหม่
 * ตัดช่วงที่ [วันนี้, วันนี้+ariHorizonDays] · PENDING ที่ทับ/ติดกัน ⇒ รวมเป็นแถวใหม่ (เก่า SUPERSEDED) · ครอบอยู่แล้ว ⇒ ไม่ทำอะไร (X4 ส่งซ้ำ)
 */
export async function enqueueAri(tenantId: string, unitId: string, fromIn: string, toIn: string, now: Date = new Date(), opts: EnqueueOpts = {}): Promise<number> {
  if (!isStr(tenantId) || !isStr(unitId) || !isYmd(fromIn) || !isYmd(toIn)) return 0;
  const today = bkkYmd(now);
  const only = Array.isArray(opts.connectionIds) ? opts.connectionIds.filter(isStr) : null;
  const conns = await tenantDb({ tenantId }).tenantIntegration.findMany({
    where: { kind: CHANNEL_KIND, ...(only ? { id: { in: only } } : {}), OR: [{ unitIds: { isEmpty: true } }, { unitIds: { has: unitId } }] },
    select: { id: true },
  });
  if (!conns.length) return 0;
  const horizon = await horizonOf(tenantId, unitId);
  const from = fromIn < today ? today : fromIn;
  const last = ymdAdd(today, horizon);
  const to = toIn > last ? last : toIn;
  if (from > to) return 0;
  const db = tenantDb({ tenantId, unitId });
  const mapped = await db.channelRoomMap.groupBy({ by: ["connectionId"], where: { connectionId: { in: conns.map((c) => c.id) }, active: true }, _count: { _all: true } });
  let n = 0;
  for (const c of conns) {
    if (!mapped.some((m) => m.connectionId === c.id)) continue;
    const made = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`channel-ari:${c.id}:${unitId}`}::text))`;
      const pend = await tx.channelAriJob.findMany({ where: { tenantId, unitId, connectionId: c.id, status: "PENDING" }, select: { id: true, dateFrom: true, dateTo: true } });
      const span = pend.map((j) => ({ id: j.id, f: ymdOfDb(j.dateFrom), t: ymdOfDb(j.dateTo) }));
      const touch = span.filter((j) => ymdDayNo(j.f) <= ymdDayNo(to) + 1 && ymdDayNo(j.t) >= ymdDayNo(from) - 1);
      if (touch.some((j) => j.f <= from && j.t >= to)) return false;
      if (opts.freshMs && opts.freshMs > 0) {
        // lease ของ full resync: งานครอบช่วงนี้ (ท้ายเผื่อ 1 วันข้ามเที่ยงคืน) สร้างภายในรอบแล้ว ⇒ ไม่สร้างซ้ำ
        const recent = await tx.channelAriJob.count({
          where: { tenantId, unitId, connectionId: c.id, dateFrom: { lte: dbDate(from) }, dateTo: { gte: dbDate(ymdAdd(to, -1)) }, createdAt: { gte: new Date(now.getTime() - opts.freshMs) } },
        });
        if (recent > 0) return false;
      }
      const nf = touch.reduce((a, j) => (j.f < a ? j.f : a), from);
      const nt = touch.reduce((a, j) => (j.t > a ? j.t : a), to);
      if (touch.length) await tx.channelAriJob.updateMany({ where: { tenantId, unitId, id: { in: touch.map((j) => j.id) }, status: "PENDING" }, data: { status: "SUPERSEDED" } });
      await tx.channelAriJob.create({ data: { tenantId, unitId, connectionId: c.id, dateFrom: dbDate(nf), dateTo: dbDate(nt), payloadHash: "", status: "PENDING" } });
      return true;
    });
    if (made) n++;
  }
  return n;
}

/** consumer ของ channel.ari.dirty — รวมชุดเป็น ChannelAriJob (โยน = คิว retry) */
export async function onAriDirty(evt: EvtLike): Promise<void> {
  const p = isRec(evt?.payload) ? evt.payload : {};
  const unitId = isStr(p.unitId) ? p.unitId : isStr(evt?.unitId) ? evt.unitId : null;
  if (!isStr(evt?.tenantId) || !unitId) return;
  const today = bkkYmd(new Date());
  const from = isYmd(p.from) ? p.from : today;
  const to = isYmd(p.to) ? p.to : ymdAdd(today, ARI_MAX_HORIZON);
  await enqueueAri(evt.tenantId, unitId, from <= to ? from : to, from <= to ? to : from);
}

/**
 * hotel.booking.* ⇒ ARI ของคืนที่กระทบ (ไม่แก้ booking.ts — ฟังจาก consumer) · รวมชุดตรง (ไม่ยิง dirty ซ้ำ)
 * changed (ต่อ/ย่น/ย้าย/เลื่อน · ไม่รู้วันเดิม) ⇒ ทั้งช่วงเพดาน · อื่น ⇒ คืนของการจอง
 */
export async function ariDirtyFromBooking(evt: EvtLike): Promise<void> {
  const p = isRec(evt?.payload) ? evt.payload : {};
  const unitId = isStr(p.unitId) ? p.unitId : isStr(evt?.unitId) ? evt.unitId : null;
  if (!isStr(evt?.tenantId) || !unitId) return;
  const today = bkkYmd(new Date());
  if (evt.type === "hotel.booking.changed" || !isStr(p.reservationId)) {
    await enqueueAri(evt.tenantId, unitId, today, ymdAdd(today, ARI_MAX_HORIZON));
    return;
  }
  const db = tenantDb({ tenantId: evt.tenantId, unitId });
  const rv = await db.hotelReservation.findFirst({ where: { id: p.reservationId }, select: { checkInDate: true, checkOutDate: true } });
  if (!rv) return;
  const from = ymdOfDb(rv.checkInDate);
  let lastNight = ymdAdd(ymdOfDb(rv.checkOutDate), -1);
  if (evt.type === "hotel.checked_out") {
    // เช็กเอาต์ก่อนกำหนด: checkOutDate อาจถูกย่นแล้ว ⇒ ครอบถึงคืนสุดท้ายที่เคยมี (นับหรือปล่อยแล้ว) ของการจองนี้ (RB-7)
    const n = await db.hotelBookingNight.aggregate({ where: { reservationId: p.reservationId }, _max: { date: true } });
    const maxNight = n._max.date ? ymdOfDb(n._max.date) : null;
    if (maxNight && maxNight > lastNight) lastNight = maxNight;
  }
  await enqueueAri(evt.tenantId, unitId, from, lastNight < from ? from : lastNight);
}

/**
 * rooms.occupancy.changed (claim/release/move/resize/expire — LEASE หอ · BLOCK · STAY · HOLD) ⇒ ARI ของคืนในช่วง (payload {unitId, roomId, from, to} · to ไม่รวม · resize = ช่วง union เดิม∪ใหม่)
 * หน่วยไม่มีแม็ปของตัวต่อ (หอล้วน) ⇒ enqueueAri ไม่สร้างงาน
 */
export async function ariDirtyFromOccupancy(evt: EvtLike): Promise<void> {
  const p = isRec(evt?.payload) ? evt.payload : {};
  const unitId = isStr(p.unitId) ? p.unitId : isStr(evt?.unitId) ? evt.unitId : null;
  if (!isStr(evt?.tenantId) || !unitId) return;
  const today = bkkYmd(new Date());
  const from = isYmd(p.from) ? p.from : today;
  const to = isYmd(p.to) ? ymdAdd(p.to, -1) : ymdAdd(today, ARI_MAX_HORIZON);
  await enqueueAri(evt.tenantId, unitId, from, to < from ? from : to);
}

/**
 * hotel.hk.changed (H.6 · payload {roomId, from, to} = สถานะแม่บ้าน) — เข้า/ออกจากปิดซ่อม (OUT_OF_ORDER) ⇒ ห้องขายได้เปลี่ยน ⇒ ARI ทั้งช่วงเพดาน
 * สถานะอื่น (สกปรก/สะอาด/ตรวจ) ไม่กระทบห้องว่าง ⇒ ไม่ทำอะไร
 */
export async function ariDirtyFromHk(evt: EvtLike): Promise<void> {
  const p = isRec(evt?.payload) ? evt.payload : {};
  const unitId = isStr(p.unitId) ? p.unitId : isStr(evt?.unitId) ? evt.unitId : null;
  if (!isStr(evt?.tenantId) || !unitId) return;
  if (p.from !== "OUT_OF_ORDER" && p.to !== "OUT_OF_ORDER") return;
  const today = bkkYmd(new Date());
  await enqueueAri(evt.tenantId, unitId, today, ymdAdd(today, ARI_MAX_HORIZON));
}

type PairRow = { tenantId: string; connectionId: string; unitId: string };
/** คู่ (ตัวต่อ, หน่วย) ที่มีแม็ปห้อง active และตัวต่อครอบหน่วย — เฉพาะตัวต่อที่พร้อม (CONNECTED/ERROR) */
async function resyncPairs(only?: { tenantId: string; connectionId: string }): Promise<PairRow[]> {
  const rows = await scanDb().$queryRaw<(PairRow & { unitIds: string[] })[]>`
    SELECT DISTINCT m."tenantId", m."connectionId", m."unitId", t."unitIds"
      FROM "ChannelRoomMap" m JOIN "TenantIntegration" t ON t."id" = m."connectionId" AND t."tenantId" = m."tenantId"
     WHERE m."active" = true AND t."kind" = ${CHANNEL_KIND} AND t."status" IN ('CONNECTED', 'ERROR')
       AND (${only?.connectionId ?? null}::text IS NULL OR (m."connectionId" = ${only?.connectionId ?? ""} AND m."tenantId" = ${only?.tenantId ?? ""}))
     ORDER BY m."tenantId", m."connectionId", m."unitId" LIMIT 2000`;
  return rows.filter((r) => covers(r.unitIds, r.unitId)).map(({ tenantId, connectionId, unitId }) => ({ tenantId, connectionId, unitId }));
}
/** ตัวต่อพร้อมใช้ (ผู้ให้บริการเปิด · มีกุญแจ) — ไม่พร้อม ⇒ ข้าม */
async function readyConn(tenantId: string, connectionId: string): Promise<boolean> {
  const row = await tenantDb({ tenantId }).tenantIntegration.findFirst({ where: { id: connectionId, kind: CHANNEL_KIND, status: { in: ACTIVE_CONN } } });
  return !!row && integrationHandleForRow(row) !== null;
}

/**
 * งานรายนาที channel-ari-resync: full resync ARI ทั้งช่วงเพดาน (ariHorizonDays) ต่อ (ตัวต่อ, หน่วย) ทุก ARI_RESYNC_EVERY_MS (6 ชม.)
 * ปิดเส้นที่ไม่มี event (สัญญาหอ/สร้าง-เก็บห้อง/ปิดซ่อมทางตรง/แก้ค่าตั้ง ota.buffer·markupBp/ตัวต่อเปลี่ยนสถานะตรงฐาน) และงาน FAILED ที่ไม่มีใครส่งซ้ำ
 * lease: แถว lease ของ minute-job + ตรวจ "งานครอบสร้างภายในรอบ" ใต้ advisory lock ต่อคู่ (ซ้อน 2 รอบ = สร้างครั้งเดียว) · ข้ามตัวต่อที่ไม่พร้อม · ไม่ throw
 * คำนวณ/ส่งจริงที่ pushAriJobs (buildAri เดิม · คิวรีคงที่) · ค่าเท่างานที่ส่งล่าสุดช่วงเดียวกัน ⇒ ไม่เรียกตัวต่อ
 */
export async function resyncAriAll(now: Date = new Date(), budgetMs = 20_000): Promise<{ enqueued: number; skipped: number }> {
  const out = { enqueued: 0, skipped: 0 };
  const deadline = Date.now() + Math.max(1_000, Number.isFinite(budgetMs) ? budgetMs : 20_000);
  let pairs: PairRow[] = [];
  try {
    pairs = await resyncPairs();
  } catch {
    console.warn("[hotel.channel] อ่านคู่ตัวต่อ/หน่วยสำหรับ resync ไม่สำเร็จ");
    return out;
  }
  const ready = new Map<string, boolean>();
  const today = bkkYmd(now);
  for (const pr of pairs) {
    if (Date.now() > deadline) break;
    try {
      if (!ready.has(pr.connectionId)) ready.set(pr.connectionId, await readyConn(pr.tenantId, pr.connectionId));
      if (!ready.get(pr.connectionId)) {
        out.skipped++;
        continue;
      }
      const n = await enqueueAri(pr.tenantId, pr.unitId, today, ymdAdd(today, ARI_MAX_HORIZON), now, { connectionIds: [pr.connectionId], freshMs: ARI_RESYNC_EVERY_MS });
      if (n > 0) out.enqueued++;
      else out.skipped++;
    } catch {
      console.warn(`[hotel.channel] resync ARI ${pr.connectionId}/${pr.unitId} ไม่สำเร็จ — ลองรอบหน้า`);
    }
  }
  return out;
}

/**
 * integration.connected (ตัวต่อกลับมาเชื่อมได้ · ERROR/DRAFT → CONNECTED) ⇒ full resync ทันทีทุกหน่วยที่แม็ปของตัวต่อนั้น (ไม่รอรอบ 6 ชม.)
 * ชนิดอื่น ⇒ ไม่ทำอะไร · โยน = คิว retry (idempotent: งานครอบอยู่แล้ว ⇒ ไม่สร้างซ้ำ)
 */
export async function ariResyncOnConnected(evt: EvtLike): Promise<void> {
  const p = isRec(evt?.payload) ? evt.payload : {};
  if (!isStr(evt?.tenantId) || p.kind !== CHANNEL_KIND || !isStr(p.integrationId)) return;
  const today = bkkYmd(new Date());
  for (const pr of await resyncPairs({ tenantId: evt.tenantId, connectionId: p.integrationId })) {
    await enqueueAri(pr.tenantId, pr.unitId, today, ymdAdd(today, ARI_MAX_HORIZON), new Date(), { connectionIds: [pr.connectionId] });
  }
}

// ───────────────────────── buildAri ─────────────────────────
/** ARI ของแม็ปหน่วยเดียว ช่วง [from, to] (รวมสองปลาย · ≤ 366 วัน) — คิวรีคงที่ (ไม่ขึ้นกับจำนวนวัน) */
async function ariChunk(tenantId: string, m: ChannelMapping, from: string, to: string, out: Record<string, AriDay>): Promise<void> {
  const ctx = { tenantId };
  const planIds = [...new Set(m.rates.map((r) => r.ratePlanId))];
  const typeIds = [...new Set([...m.rooms.map((r) => r.roomTypeId), ...m.buffers.map((b) => b.roomTypeId)])];
  const refs = [{ unitId: m.unitId }, ...planIds.map((ratePlanId) => ({ unitId: m.unitId, ratePlanId })), ...typeIds.map((roomTypeId) => ({ unitId: m.unitId, roomTypeId }))];
  const [av, pc, st] = await Promise.all([
    hotelAvailability.get(ctx, { unitId: m.unitId, from, to: ymdAdd(to, 1) }),
    loadPricingContext(ctx, m.unitId, { from, to }),
    resolveSettingsMany(ctx, [KEY.markup, KEY.buffer, KEY.minNights, KEY.cta], refs),
  ]);
  const planSet = (id: string) => st[1 + planIds.indexOf(id)] ?? {};
  const typeSet = (id: string) => st[1 + planIds.length + typeIds.indexOf(id)] ?? {};
  for (const d of datesInclusive(from, to)) {
    const day: AriDay = out[d] ?? {};
    out[d] = day;
    if (!av.ok || !pc) continue;
    for (const rm of m.rooms) {
      const cell = av.byDate[d]?.[rm.roomTypeId];
      if (!cell) continue; // ประเภทไม่ active / ไม่ใช่ของหน่วยนี้ (แม็ปผิดหน่วย) ⇒ ไม่ส่ง
      const bufRow = m.buffers.find((b) => b.roomTypeId === rm.roomTypeId);
      const buffer = bufRow ? bufRow.rooms : Math.max(0, num(typeSet(rm.roomTypeId)[KEY.buffer]?.value) ?? 0);
      const available = Math.max(0, cell.available - buffer);
      const rates: AriDay[string]["rates"] = {};
      for (const rp of m.rates) {
        const plan = pc.plans.find((x) => x.id === rp.ratePlanId);
        if (!plan) continue; // แผนเก็บเข้าคลัง/ไม่ใช่ของหน่วย
        const price = resolveNightPrice(pc, { roomTypeId: rm.roomTypeId, ratePlanId: plan.id, date: d });
        if (!price) continue;
        const ps = planSet(plan.id);
        const bp = rp.markupBp ?? num(ps[KEY.markup]?.value) ?? DEFAULT_MARKUP_BP;
        const minN = Math.max(plan.minNights ?? 0, resolveSeason(pc.seasons, d)?.minNights ?? 0, num(ps[KEY.minNights]?.value) ?? 0);
        rates[rp.externalRateId] = { priceSatang: markupPrice(price.priceSatang, { markupBp: bp }, pc.rounding), minNights: minN > 0 ? minN : null, closedToArrival: ps[KEY.cta]?.value === true };
      }
      day[rm.externalRoomId] = { available, rates, stopSell: available === 0 || Object.keys(rates).length === 0 };
    }
  }
}

/** ARI ของแม็ป (หลายก้อนถ้าช่วงยาว) */
async function ariFor(tenantId: string, m: ChannelMapping, from: string, to: string, out: Record<string, AriDay> = {}): Promise<Record<string, AriDay>> {
  for (let f = from; f <= to; f = ymdAdd(f, CHUNK_DAYS)) {
    const e = ymdAdd(f, CHUNK_DAYS - 1);
    await ariChunk(tenantId, m, f, e < to ? e : to, out);
  }
  return out;
}

/**
 * ARI ของตัวต่อ ช่วง [from, to] รวมสองปลาย (ตัวภายใน · ไม่มี actor) — ทุกหน่วยที่ตัวต่อครอบและมีแม็ป (หรือเฉพาะ unitId)
 * คืน AriPayload {byDate} ตรง ๆ (ariHash ของผลนี้ = payloadHash ของงานที่ส่ง) · ผิด ⇒ { ok:false, code, reason }
 */
export async function buildAri(connectionId: unknown, from: unknown, to: unknown, unitId?: string): Promise<AriPayload | ChannelFail> {
  if (!isYmd(from) || !isYmd(to) || to < from || ymdDayNo(to) - ymdDayNo(from) > ARI_MAX_HORIZON) return fail("VALIDATION", "ช่วงวันที่ไม่ถูกต้อง (รวมสองปลาย · ไม่เกิน 401 วัน)");
  const conn = await connectionById(connectionId);
  if (!conn) return fail("NOT_FOUND", R.notFound);
  const maps = await loadMappings(conn);
  const byDate: Record<string, AriDay> = {};
  for (const d of datesInclusive(from, to)) byDate[d] = {};
  for (const m of maps.values()) {
    if (unitId && m.unitId !== unitId) continue;
    if (!m.rooms.length) continue;
    await ariFor(conn.tenantId, m, from, to, byDate);
  }
  return { byDate };
}

// ───────────────────────── pushAriJobs ─────────────────────────
type JobRow = { id: string; tenantId: string; unitId: string; connectionId: string; dateFrom: Date; dateTo: Date; attempts: number; updatedAt: Date };
const backoffMs = (attempts: number): number => 2 ** Math.max(0, attempts - 1) * 60_000;

async function settleJob(job: JobRow, data: Prisma.ChannelAriJobUncheckedUpdateManyInput, ev: { type: string; payload: Record<string, unknown> } | null): Promise<boolean> {
  const db = tenantDb({ tenantId: job.tenantId, unitId: job.unitId });
  return db.$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const u = await tx.channelAriJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, unitId: job.unitId, status: "PENDING" }, data });
    if (u.count === 0) return false; // ถูกแทน (SUPERSEDED) ระหว่างส่ง — งานใหม่ส่งเอง
    if (ev) await emitOutbox(tx, { tenantId: job.tenantId, unitId: job.unitId, type: ev.type, idempotencyKey: `${ev.type}#${job.id}`, payload: ev.payload });
    return true;
  });
}

/**
 * งานรายนาที channel-ari-push: ส่งงาน PENDING ของตัวต่อที่ไม่ถูกถอด (ข้ามร้าน · ทีละงาน · เคารพงบเวลา) — ไม่ throw
 * จองงานด้วย CAS attempts (ยิงพร้อมกัน 2 รอบ = ส่งครั้งเดียว · X5) · now ฉีดได้ (ข้อสอบ backoff)
 */
export async function pushAriJobs(now: Date = new Date(), budgetMs = 20_000): Promise<{ sent: number; skipped: number; failed: number; retry: number }> {
  const out = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  const deadline = Date.now() + Math.max(1_000, Number.isFinite(budgetMs) ? budgetMs : 20_000);
  let rows: JobRow[] = [];
  try {
    rows = await scanDb().$queryRaw<JobRow[]>`
      SELECT j."id", j."tenantId", j."unitId", j."connectionId", j."dateFrom", j."dateTo", j."attempts", j."updatedAt"
        FROM "ChannelAriJob" j JOIN "TenantIntegration" t ON t."id" = j."connectionId" AND t."tenantId" = j."tenantId"
       WHERE j."status" = 'PENDING' AND t."kind" = ${CHANNEL_KIND} AND t."status" IN ('CONNECTED', 'ERROR')
       ORDER BY j."createdAt" ASC, j."id" ASC LIMIT ${PUSH_BATCH}`;
  } catch {
    console.warn("[hotel.channel] อ่านงาน ARI ไม่สำเร็จ");
    return out;
  }
  for (const job of rows) {
    if (Date.now() > deadline) break;
    try {
      if (job.attempts > 0 && now.getTime() < job.updatedAt.getTime() + backoffMs(job.attempts)) continue;
      const db = tenantDb({ tenantId: job.tenantId, unitId: job.unitId });
      const claim = await db.channelAriJob.updateMany({ where: { id: job.id, status: "PENDING", attempts: job.attempts }, data: { attempts: job.attempts + 1 } });
      if (claim.count === 0) continue;
      const attempts = job.attempts + 1;
      const from = ymdOfDb(job.dateFrom);
      const to = ymdOfDb(job.dateTo);
      const row = await tenantDb({ tenantId: job.tenantId }).tenantIntegration.findFirst({ where: { id: job.connectionId, kind: CHANNEL_KIND } });
      const conn: ConnectionRow | null = row ? { id: row.id, tenantId: row.tenantId, kind: row.kind, provider: row.provider, label: row.label, status: row.status, unitIds: row.unitIds, onFailure: row.onFailure } : null;
      const m = conn && covers(conn.unitIds, job.unitId) ? (await loadMappings(conn)).get(job.unitId) : undefined;
      if (!row || !conn || conn.status === "DISABLED" || !m || !m.rooms.length) {
        await settleJob(job, { status: "SUPERSEDED", lastError: "ตัวต่อถูกถอดหรือไม่มีแม็ปห้องแล้ว" }, null);
        out.skipped++;
        continue;
      }
      const ari: AriPayload = { byDate: {} };
      for (const d of datesInclusive(from, to)) ari.byDate[d] = {};
      await ariFor(job.tenantId, m, from, to, ari.byDate);
      const hash = ariHash(ari);
      // X3: ค่าเดิมที่ส่งล่าสุด (ช่วงเดียวกัน · ไม่มีงานที่ทับส่งหลังจากนั้น) ⇒ ไม่เรียกตัวต่อซ้ำ
      const lastSent = await db.channelAriJob.findFirst({
        where: { connectionId: job.connectionId, status: "SENT", dateFrom: { lte: job.dateTo }, dateTo: { gte: job.dateFrom } },
        orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
        select: { dateFrom: true, dateTo: true, payloadHash: true, sentAt: true },
      });
      // งาน FAILED ที่ทับช่วงหลังส่งล่าสุด ⇒ ช่องทางอาจถือค่าที่ไม่รู้ ⇒ ส่งจริงแม้ค่าเท่า (full resync ปิดงาน FAILED · รอบ 3)
      const failedSince =
        lastSent && lastSent.payloadHash === hash
          ? await db.channelAriJob.count({ where: { connectionId: job.connectionId, status: "FAILED", dateFrom: { lte: job.dateTo }, dateTo: { gte: job.dateFrom }, updatedAt: { gt: lastSent.sentAt ?? new Date(0) } } })
          : 0;
      if (lastSent && lastSent.payloadHash === hash && failedSince === 0 && ymdOfDb(lastSent.dateFrom) === from && ymdOfDb(lastSent.dateTo) === to) {
        await settleJob(job, { status: "SUPERSEDED", payloadHash: hash, lastError: null }, null);
        out.skipped++;
        continue;
      }
      const handle = integrationHandleForRow(row);
      const dates = Object.keys(ari.byDate).sort();
      const r = handle
        ? await callIntegration(handle as IntegrationHandle<"CHANNEL_MANAGER">, "channel.pushAri", (a, ctl) => a.pushAri(m, dates, ari, { signal: ctl.signal, connectionId: job.connectionId }))
        : ({ ok: false, code: "NOT_READY" } as const);
      if (r.ok) {
        await settleJob(job, { status: "SENT", sentAt: new Date(), payloadHash: hash, lastError: null }, { type: "channel.ari.pushed", payload: { connectionId: job.connectionId, jobId: job.id, unitId: job.unitId, days: dates.length, from, to } });
        out.sent++;
        continue;
      }
      const lastError = `ส่งราคา/ห้องว่างให้ช่องทางไม่สำเร็จ (${r.code}) ครั้งที่ ${attempts}`;
      if (attempts >= ARI_MAX_ATTEMPTS) {
        await settleJob(job, { status: "FAILED", payloadHash: hash, lastError }, { type: "channel.ari.failed", payload: { connectionId: job.connectionId, jobId: job.id, unitId: job.unitId, attempts, code: r.code, onFailure: conn.onFailure } });
        out.failed++;
      } else {
        await settleJob(job, { lastError }, null);
        out.retry++;
      }
    } catch {
      console.warn(`[hotel.channel] ส่งงาน ARI ${job.id} ไม่สำเร็จ — ลองรอบหน้า`);
    }
  }
  return out;
}
