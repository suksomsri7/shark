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
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);

// ───────────────────────── dirty ─────────────────────────
export type AriDirtyInput = { unitId: string; roomTypeIds?: string[]; from?: string | null; to?: string | null };

/**
 * ยิง channel.ari.dirty (ตัวยิงจาก rates.ts/block.ts/แม็ป — §9.10) · ไม่ throw
 * tx ส่งมา ⇒ เขียน outbox ใน tx เดียวกับงาน (atomic: งานย้อน = ไม่มี dirty) · ไม่ส่ง ⇒ นอก tx
 * ร้านที่ไม่มีตัวต่อ CHANNEL_MANAGER (ที่ไม่ถอด) ⇒ ไม่ยิง · from/to ไม่ส่ง ⇒ วันนี้ → +400 (ผู้รวมชุดตัดตาม ariHorizonDays)
 */
export async function emitAriDirty(ctx: { tenantId: string }, input: AriDirtyInput, tx?: object): Promise<void> {
  try {
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
    const where = { tenantId: ctx.tenantId, kind: CHANNEL_KIND, status: { not: "DISABLED" } };
    if (tx) {
      const t = tx as Tx;
      if ((await t.tenantIntegration.count({ where })) === 0) return;
      await emitOutbox(t, ev);
    } else {
      if ((await tenantDb({ tenantId: ctx.tenantId }).tenantIntegration.count({ where })) === 0) return;
      await emitOutboxOutsideTx(ev);
    }
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

/**
 * รวมชุดงาน ARI ของทุกตัวต่อที่ครอบหน่วย (CONNECTED/ERROR · มีแม็ปห้องของหน่วย) — คืนจำนวนตัวต่อที่มีงานใหม่
 * ตัดช่วงที่ [วันนี้, วันนี้+ariHorizonDays] · PENDING ที่ทับ/ติดกัน ⇒ รวมเป็นแถวใหม่ (เก่า SUPERSEDED) · ครอบอยู่แล้ว ⇒ ไม่ทำอะไร (X4 ส่งซ้ำ)
 */
export async function enqueueAri(tenantId: string, unitId: string, fromIn: string, toIn: string, now: Date = new Date()): Promise<number> {
  if (!isStr(tenantId) || !isStr(unitId) || !isYmd(fromIn) || !isYmd(toIn)) return 0;
  const today = bkkYmd(now);
  const conns = await tenantDb({ tenantId }).tenantIntegration.findMany({
    where: { kind: CHANNEL_KIND, status: { in: ACTIVE_CONN }, OR: [{ unitIds: { isEmpty: true } }, { unitIds: { has: unitId } }] },
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
  const rv = await tenantDb({ tenantId: evt.tenantId, unitId }).hotelReservation.findFirst({ where: { id: p.reservationId }, select: { checkInDate: true, checkOutDate: true } });
  if (!rv) return;
  const from = ymdOfDb(rv.checkInDate);
  const lastNight = ymdAdd(ymdOfDb(rv.checkOutDate), -1);
  await enqueueAri(evt.tenantId, unitId, from, lastNight < from ? from : lastNight);
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
        select: { dateFrom: true, dateTo: true, payloadHash: true },
      });
      if (lastSent && lastSent.payloadHash === hash && ymdOfDb(lastSent.dateFrom) === from && ymdOfDb(lastSent.dateTo) === to) {
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
