// SVC H.10 ▸ การจองขาเข้าจากช่องทาง — inbox idempotent → การจอง (ใบสั่ง ledger/svc-briefs/svc-brief-h.10.md §0 · §2 ข้อ 1–2 · 6 · 8 · §9.2 · §9.6 · §10.3/5/6/7/13)
//   inbox: RECEIVED → APPLIED | NEEDS_ROOM | REJECTED · NEEDS_ROOM → (ลองอีกครั้ง) APPLIED | REJECTED · กุญแจ = (ตัวต่อ, externalId, version) unique ที่ฐาน
//   • ingestInbound: เก็บแถว (raw = หลักฐานจากช่องทางทั้งก้อน · ไม่ส่งต่อ DTO/log/event) · ซ้ำ = ข้าม (skipDuplicates) · ยิง channel.reservation.received ต่อแถวใหม่
//   • applyInbound: APPLIED แล้ว = no-op (คืน reservationId เดิม) · ฉบับต่ำกว่าที่ APPLIED ⇒ REJECTED STALE (ตรวจก่อนดูห้อง) · แม็ปห้อง/แผนไม่ได้ ⇒ REJECTED
//     NEW/MODIFIED ⇒ createBooking(internal.channel) — ห้องว่าง/ราคา/คืน/ห้องจริงใน guard tx เดียวของ H.3 + inbox APPLIED + event ใน tx เดียวกัน (onCreated)
//       มีการจองเดิมของ externalId ⇒ ยกเลิกเดิม+สร้างใหม่ใน tx เดียว (ห้องไม่พอ ⇒ NEEDS_ROOM · การจองเดิมคง)
//     CANCELLED ⇒ cancelBooking(by CHANNEL) ไม่คืนเงินผ่าน POS · ห้องไม่พอ ⇒ NEEDS_ROOM (คิว "ต้องจัดห้อง") ไม่สร้างการจองเกิน
//     ล้มกลางทาง/ระบบไม่ว่าง ⇒ คง RECEIVED (pullAll รอบหน้าลองใหม่) · ack ผ่าน callIntegration เมื่อ APPLIED/REJECTED (ack ล้ม ≠ ย้อนการจอง)
//   • ไม่ throw · ไม่มี PII ใน event/log/AuditLog (X8/X10) · ข้ามร้าน/หน่วยนอกตัวต่อ ⇒ NOT_FOUND
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { callIntegration, integrationHandleForRow, type IntegrationHandle } from "@/lib/core/integrations";
import { cancelBooking, channelCancelInput, createBooking, type CreateBookingInternal } from "../booking";
import { isYmd } from "../pricing";
import { INBOX_REASON_TH, type InboundReservation, type InboxReason } from "./types";
import { CHANNEL_KIND, R, channelGate, connectionById, covers, fail, isFail, isRec, isStr, scanDb, type ChannelFail, type ConnectionRow } from "./mapping";

type Tx = Prisma.TransactionClient;
type InboxRow = { id: string; tenantId: string; unitId: string; connectionId: string; externalId: string; version: number; status: string; reservationId: string | null; raw: unknown };
export type ApplyResult = { ok: true; inboxId: string; status: "APPLIED" | "NEEDS_ROOM" | "REJECTED" | "RECEIVED"; reservationId: string | null; reason: InboxReason | null } | ChannelFail;
const ACTIVE_CONN = ["CONNECTED", "ERROR"];
const ACTIVE_RV = ["HOLD", "CONFIRMED", "CHECKED_IN"] as const;
const APPLY_TRIES = 3;
const PULL_APPLY_MAX = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── รูปแถวจากช่องทาง ─────────────────────────
const money = z.number().int().min(0).max(10_000_000_000);
const InboundSchema = z.object({
  externalId: z.string().trim().min(1).max(64),
  version: z.number().int().min(1).max(1_000_000),
  status: z.enum(["NEW", "MODIFIED", "CANCELLED"]),
  externalRoomId: z.string().trim().min(1).max(64),
  externalRateId: z.string().trim().max(64).nullable().optional(),
  checkIn: z.string().refine((s) => isYmd(s)),
  checkOut: z.string().refine((s) => isYmd(s)),
  rooms: z.number().int().min(1).max(10).optional(),
  adults: z.number().int().min(1).max(60),
  children: z.number().int().min(0).max(60).optional(),
  guest: z.object({ name: z.string().trim().min(1).max(120), phone: z.string().trim().max(32).nullable().optional(), email: z.string().trim().max(120).nullable().optional() }),
  grossSatang: money,
  commissionSatang: money,
  netSatang: money,
  prepaid: z.boolean(),
});
type Parsed = z.infer<typeof InboundSchema>;
const KeySchema = z.object({ externalId: z.string().trim().min(1).max(64), version: z.number().int().min(1).max(1_000_000) });

// ───────────────────────── ตัวช่วย ─────────────────────────
async function inboxById(inboxId: unknown): Promise<InboxRow | null> {
  if (!isStr(inboxId)) return null;
  const rows = await scanDb().$queryRaw<InboxRow[]>`
    SELECT "id", "tenantId", "unitId", "connectionId", "externalId", "version", "status", "reservationId", "raw" FROM "ChannelReservationInbox" WHERE "id" = ${inboxId} LIMIT 1`;
  return rows[0] ?? null;
}
const evPayload = (row: InboxRow, extra: Record<string, unknown> = {}) => ({ inboxId: row.id, connectionId: row.connectionId, unitId: row.unitId, version: row.version, ...extra });
/** handle ของแถวตัวต่อ (ไม่พร้อม/ถอด ⇒ null) */
async function handleOf(tenantId: string, connectionId: string): Promise<IntegrationHandle<"CHANNEL_MANAGER"> | null> {
  const row = await tenantDb({ tenantId }).tenantIntegration.findFirst({ where: { id: connectionId, kind: CHANNEL_KIND } });
  if (!row || !ACTIVE_CONN.includes(row.status)) return null;
  return integrationHandleForRow(row) as IntegrationHandle<"CHANNEL_MANAGER"> | null;
}
/** ตอบรับกับตัวต่อ (APPLIED/REJECTED) — ล้ม = บันทึกใน IntegrationCallLog เท่านั้น ไม่ย้อนอะไร (§10.6) */
async function ack(row: InboxRow): Promise<void> {
  try {
    const h = await handleOf(row.tenantId, row.connectionId);
    if (!h) return;
    await callIntegration(h, "channel.ackReservation", (a, ctl) => a.ackReservation(row.externalId, { signal: ctl.signal, connectionId: row.connectionId }));
  } catch {
    console.warn("[hotel.channel] ตอบรับการจองกับช่องทางไม่สำเร็จ — ลองรอบหน้า");
  }
}
/** เปลี่ยนสถานะ inbox แบบ CAS + event ใน tx เดียว — คืน true เมื่อเปลี่ยนจริง */
async function moveInbox(row: InboxRow, from: string[], to: "APPLIED" | "NEEDS_ROOM" | "REJECTED", data: { error: string | null; reservationId?: string | null }, ev: { type: string; extra?: Record<string, unknown> } | null): Promise<boolean> {
  return tenantDb({ tenantId: row.tenantId, unitId: row.unitId }).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const u = await tx.channelReservationInbox.updateMany({ where: { id: row.id, tenantId: row.tenantId, unitId: row.unitId, status: { in: from } }, data: { status: to, ...data } });
    if (u.count === 0) return false;
    if (ev) await emitOutbox(tx, { tenantId: row.tenantId, unitId: row.unitId, type: ev.type, idempotencyKey: `${ev.type}#${row.id}`, payload: evPayload(row, ev.extra) });
    return true;
  });
}
async function reject(row: InboxRow, reason: InboxReason): Promise<ApplyResult> {
  const moved = await moveInbox(row, ["RECEIVED", "NEEDS_ROOM"], "REJECTED", { error: reason }, { type: "channel.reservation.rejected", extra: { reason } });
  if (moved) await ack(row);
  return { ok: true, inboxId: row.id, status: "REJECTED", reservationId: null, reason };
}
async function needsRoom(row: InboxRow, reason: InboxReason): Promise<ApplyResult> {
  const moved = await moveInbox(row, ["RECEIVED"], "NEEDS_ROOM", { error: reason }, { type: "channel.reservation.needs_room", extra: { reason } });
  if (!moved) await tenantDb({ tenantId: row.tenantId, unitId: row.unitId }).channelReservationInbox.updateMany({ where: { id: row.id, status: "NEEDS_ROOM" }, data: { error: reason } });
  return { ok: true, inboxId: row.id, status: "NEEDS_ROOM", reservationId: null, reason };
}
/** ตัวบันทึก APPLIED ใน tx ของการจอง/ยกเลิก: ล็อกต่อ externalId → การจองที่ active ของเลขนี้ต้องเป็นของรายการนี้เท่านั้น → ไม่มีฉบับใหม่กว่าที่ APPLIED → CAS */
function appliedHook(row: InboxRow, evType: "channel.reservation.applied" | "channel.reservation.cancelled") {
  return async (tx: Tx, ids: string[]): Promise<string | null> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`channel-ext:${row.connectionId}:${row.externalId}`}::text))`;
    if (evType === "channel.reservation.applied") {
      const other = await tx.hotelReservation.count({ where: { tenantId: row.tenantId, unitId: row.unitId, channelConnectionId: row.connectionId, channelRef: row.externalId, status: { in: [...ACTIVE_RV] }, id: { notIn: ids } } });
      if (other > 0) return "DUPLICATE";
    }
    const newer = await tx.channelReservationInbox.count({ where: { tenantId: row.tenantId, unitId: row.unitId, connectionId: row.connectionId, externalId: row.externalId, status: "APPLIED", version: { gt: row.version } } });
    if (newer > 0) return "STALE";
    const reservationId = ids[0] ?? null;
    const u = await tx.channelReservationInbox.updateMany({ where: { id: row.id, tenantId: row.tenantId, unitId: row.unitId, status: { in: ["RECEIVED", "NEEDS_ROOM"] } }, data: { status: "APPLIED", error: null, reservationId } });
    if (u.count === 0) return "ALREADY";
    await emitOutbox(tx, { tenantId: row.tenantId, unitId: row.unitId, type: evType, idempotencyKey: `${evType}#${row.id}`, payload: evPayload(row, { reservationId, reservationIds: ids }) });
    return null;
  };
}
/** รหัสปฏิเสธของ booking.ts ⇒ ผลของ inbox */
function outcomeOf(code: string, reason: string): { kind: "NEEDS_ROOM" | "REJECTED" | "RETRY"; why: InboxReason } {
  switch (code) {
    case "AVAILABILITY_CHANGED":
      return { kind: "NEEDS_ROOM", why: "NO_ROOM" };
    case "NO_RATE":
      return { kind: "NEEDS_ROOM", why: "NO_RATE" };
    case "INVALID_STATUS":
    case "OVER_OCCUPANCY":
    case "EXTRA_BED_NOT_ALLOWED":
      return { kind: "NEEDS_ROOM", why: "MANUAL_REQUIRED" };
    case "NOT_FOUND":
      return { kind: "REJECTED", why: "NOT_FOUND" };
    case "CHANNEL_CONFLICT":
      return reason === "STALE" ? { kind: "REJECTED", why: "STALE" } : { kind: "RETRY", why: "INVALID" };
    case "BUSY":
    case "STATE_CHANGED":
      return { kind: "RETRY", why: "INVALID" };
    default:
      return { kind: "REJECTED", why: "INVALID" };
  }
}

// ───────────────────────── ingest ─────────────────────────
/**
 * เก็บแถวจากตัวต่อลง inbox (ตัวภายใน) — ซ้ำ (ตัวต่อ, externalId, version) = ข้ามเงียบ · หน่วย = หน่วยของแม็ปห้อง (หรือหน่วยเดียวของตัวต่อ)
 * แถวที่อ่านกุญแจไม่ได้/หาหน่วยไม่ได้ ⇒ ข้าม (นับใน skipped) · ไม่ throw
 */
export async function ingestInbound(connectionId: unknown, rows: unknown): Promise<{ ok: true; received: number; duplicates: number; skipped: number; inboxIds: string[] } | ChannelFail> {
  try {
    const conn = await connectionById(connectionId);
    if (!conn) return fail("NOT_FOUND", R.notFound);
    const list = Array.isArray(rows) ? rows.slice(0, 500) : [];
    const maps = await tenantDb({ tenantId: conn.tenantId }).$queryRaw<{ unitId: string; externalRoomId: string }[]>`
      SELECT "unitId", "externalRoomId" FROM "ChannelRoomMap" WHERE "connectionId" = ${conn.id} AND "tenantId" = ${conn.tenantId}`;
    const byUnit = new Map<string, { externalId: string; version: number; raw: Prisma.InputJsonValue }[]>();
    let skipped = 0;
    for (const r of list) {
      const k = KeySchema.safeParse(r);
      const ext = isRec(r) && isStr(r.externalRoomId) ? r.externalRoomId.trim() : "";
      const unitId = maps.find((m) => m.externalRoomId === ext && covers(conn.unitIds, m.unitId))?.unitId ?? (conn.unitIds.length === 1 ? conn.unitIds[0] : null) ?? [...new Set(maps.map((m) => m.unitId))].find((u) => covers(conn.unitIds, u)) ?? null;
      let raw: Prisma.InputJsonValue | null = null;
      try {
        const s = JSON.stringify(r);
        raw = s && s.length <= 64_000 ? (JSON.parse(s) as Prisma.InputJsonValue) : null;
      } catch {
        raw = null;
      }
      if (!k.success || !unitId || raw === null) {
        skipped++;
        continue;
      }
      const arr = byUnit.get(unitId) ?? [];
      arr.push({ externalId: k.data.externalId, version: k.data.version, raw });
      byUnit.set(unitId, arr);
    }
    let received = 0;
    const inboxIds: string[] = [];
    for (const [unitId, arr] of byUnit) {
      const made = await tenantDb({ tenantId: conn.tenantId, unitId }).$transaction(async (t) => {
        const tx = t as unknown as Tx;
        const created = await tx.channelReservationInbox.createManyAndReturn({
          data: arr.map((x) => ({ tenantId: conn.tenantId, unitId, connectionId: conn.id, externalId: x.externalId, version: x.version, raw: x.raw, status: "RECEIVED" })),
          skipDuplicates: true,
          select: { id: true, externalId: true, version: true },
        });
        for (const c of created) {
          await emitOutbox(tx, {
            tenantId: conn.tenantId,
            unitId,
            type: "channel.reservation.received",
            idempotencyKey: `channel.reservation.received#${c.id}`,
            payload: { inboxId: c.id, connectionId: conn.id, unitId, version: c.version },
          });
        }
        return created.map((c) => c.id);
      });
      received += made.length;
      inboxIds.push(...made);
    }
    return { ok: true, received, duplicates: list.length - skipped - received, skipped, inboxIds };
  } catch {
    console.warn("[hotel.channel] เก็บการจองจากช่องทางไม่สำเร็จ — ลองรอบหน้า");
    return fail("BUSY", R.busy);
  }
}

// ───────────────────────── apply ─────────────────────────
/** แปลงแถว inbox เป็นการจอง/ยกเลิก (ตัวภายใน · ไม่มี actor) — idempotent · ไม่ throw */
export async function applyInbound(inboxId: unknown): Promise<ApplyResult> {
  try {
    for (let attempt = 0; attempt < APPLY_TRIES; attempt++) {
      const r = await applyOnce(inboxId);
      if (r.ok && r.status === "RECEIVED" && attempt < APPLY_TRIES - 1) {
        await sleep(50 + Math.floor(Math.random() * 150));
        continue;
      }
      return r;
    }
    return fail("BUSY", R.busy);
  } catch {
    console.warn("[hotel.channel] แปลงการจองจากช่องทางไม่สำเร็จ — คงไว้ลองรอบหน้า");
    return fail("BUSY", R.busy);
  }
}

async function applyOnce(inboxId: unknown): Promise<ApplyResult> {
  const row = await inboxById(inboxId);
  if (!row) return fail("NOT_FOUND", R.notFound);
  const done = (status: "APPLIED" | "REJECTED" | "NEEDS_ROOM" | "RECEIVED", reservationId: string | null = row.reservationId): ApplyResult => ({ ok: true, inboxId: row.id, status, reservationId, reason: null });
  if (row.status === "APPLIED") return done("APPLIED");
  if (row.status === "REJECTED") return done("REJECTED");
  const conn = await connectionById(row.connectionId);
  if (!conn || conn.tenantId !== row.tenantId) return fail("NOT_FOUND", R.notFound);
  if (!ACTIVE_CONN.includes(conn.status)) return fail("INVALID_STATUS", "ตัวต่อช่องทางนี้ถูกถอดหรือยังไม่เชื่อม — การจองคงไว้ในคิว");
  const db = tenantDb({ tenantId: row.tenantId, unitId: row.unitId });
  // ฉบับต่ำกว่าที่ APPLIED แล้ว ⇒ STALE (ตรวจก่อนดูห้อง · §10.7)
  const newer = await db.channelReservationInbox.count({ where: { connectionId: row.connectionId, externalId: row.externalId, status: "APPLIED", version: { gt: row.version } } });
  if (newer > 0) return reject(row, "STALE");
  const p = InboundSchema.safeParse(row.raw);
  if (!p.success || p.data.externalId !== row.externalId || p.data.version !== row.version || !(p.data.checkOut > p.data.checkIn)) return reject(row, "INVALID");
  const inb: Parsed = p.data;
  const active = await tenantDb({ tenantId: row.tenantId, unitId: row.unitId }).hotelReservation.findMany({
    where: { channelConnectionId: row.connectionId, channelRef: row.externalId, status: { in: [...ACTIVE_RV] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const ctx = { tenantId: row.tenantId };

  if (inb.status === "CANCELLED") {
    const r = await cancelBooking(null, ctx, channelCancelInput({ unitId: row.unitId, reservationIds: active.map((x) => x.id), onCancelled: appliedHook(row, "channel.reservation.cancelled") }));
    if (r.ok) {
      await ack(row);
      return done("APPLIED", r.cancelled[0] ?? active[0]?.id ?? null);
    }
    if (r.code === "INVALID_INPUT") {
      // ไม่มีการจองที่ active ของเลขนี้ (ยังไม่เคยลง/ยกเลิกไปแล้ว) ⇒ APPLIED เปล่า (idempotent)
      const ok = await tenantDb({ tenantId: row.tenantId, unitId: row.unitId }).$transaction(async (t) => appliedHook(row, "channel.reservation.cancelled")(t as unknown as Tx, []));
      if (ok === null) await ack(row);
      if (ok === "STALE") return reject(row, "STALE");
      return done(ok === null || ok === "ALREADY" ? "APPLIED" : "RECEIVED", null);
    }
    const o = outcomeOf(r.code, r.reason);
    if (r.code === "CHANNEL_CONFLICT" && o.kind === "RETRY") {
      const cur = await inboxById(row.id);
      if (cur?.status === "APPLIED") return done("APPLIED", cur.reservationId);
    }
    if (o.kind === "NEEDS_ROOM") return needsRoom(row, o.why);
    if (o.kind === "REJECTED") return reject(row, o.why);
    return done("RECEIVED", null);
  }

  // NEW / MODIFIED — แม็ปห้อง (ต้องเป็นประเภทของหน่วยเดียวกับ inbox · X1) และแผน
  const map = await db.channelRoomMap.findFirst({ where: { connectionId: row.connectionId, externalRoomId: inb.externalRoomId, active: true }, select: { roomTypeId: true } });
  if (!map) return reject(row, "UNMAPPED_ROOM");
  const type = await db.hotelRoomType.findFirst({ where: { id: map.roomTypeId, active: true }, select: { id: true } });
  if (!type) return reject(row, "UNMAPPED_ROOM");
  let ratePlanId: string | null = null;
  if (isStr(inb.externalRateId ?? null)) {
    const rm = await db.channelRateMap.findFirst({ where: { connectionId: row.connectionId, externalRateId: String(inb.externalRateId).trim() }, select: { ratePlanId: true } });
    if (!rm) return reject(row, "UNMAPPED_RATE");
    ratePlanId = rm.ratePlanId;
  }
  const n = inb.rooms ?? 1;
  const adultsPer = Math.max(1, Math.ceil(inb.adults / n));
  const childrenPer = Math.ceil((inb.children ?? 0) / n);
  const internal: CreateBookingInternal = {
    channel: {
      connectionId: row.connectionId,
      grossSatang: inb.grossSatang,
      commissionSatang: inb.commissionSatang,
      netSatang: inb.netSatang,
      prepaidByChannel: inb.prepaid,
      replaceReservationIds: active.map((x) => x.id),
      onCreated: appliedHook(row, "channel.reservation.applied"),
    },
  };
  const r = await createBooking(
    null,
    ctx,
    {
      unitId: row.unitId,
      rooms: Array.from({ length: n }, () => ({ roomTypeId: type.id, adults: adultsPer, children: childrenPer })),
      checkIn: inb.checkIn,
      checkOut: inb.checkOut,
      ...(ratePlanId ? { ratePlanId } : {}),
      source: "OTA",
      channelRef: row.externalId,
      guest: { name: inb.guest.name, phone: inb.guest.phone || null, email: inb.guest.email || null },
    },
    internal,
  );
  if (r.ok) {
    await ack(row);
    return done("APPLIED", r.reservations[0]?.id ?? null);
  }
  const o = outcomeOf(r.code, r.reason);
  if (r.code === "CHANNEL_CONFLICT" && o.kind === "RETRY") {
    // ทางอื่นลงรายการนี้ไปแล้ว (ยิงซ้อน) ⇒ อ่านสถานะล่าสุด
    const cur = await inboxById(row.id);
    if (cur?.status === "APPLIED") return done("APPLIED", cur.reservationId);
  }
  if (o.kind === "NEEDS_ROOM") return needsRoom(row, o.why);
  if (o.kind === "REJECTED") return reject(row, o.why);
  return done("RECEIVED", null);
}

// ───────────────────────── ดึงจากตัวต่อ (งานรายนาที) ─────────────────────────
/**
 * งานรายนาที channel-pull: ทุกตัวต่อ CONNECTED/ERROR ⇒ pullReservations(since) ผ่าน callIntegration → ingest → apply แถว RECEIVED ตามลำดับ version
 * since = max(createdAt) ของ inbox ของตัวต่อ (ไม่มีแถว = now − 24 ชม. · §9.2) · ตัวต่อถอด ⇒ ไม่ดึง · ไม่ throw · only = จำกัดร้าน/ตัวต่อ (ปุ่มดึงตอนนี้)
 */
export async function pullAll(now: Date = new Date(), budgetMs = 20_000, only?: { tenantId: string; connectionIds?: string[] }): Promise<{ pulled: number; received: number; applied: number }> {
  const out = { pulled: 0, received: 0, applied: 0 };
  const deadline = Date.now() + Math.max(1_000, Number.isFinite(budgetMs) ? budgetMs : 20_000);
  let conns: ConnectionRow[] = [];
  try {
    conns = await scanDb().$queryRaw<ConnectionRow[]>`
      SELECT "id", "tenantId", "kind", "provider", "label", "status", "unitIds", "onFailure" FROM "TenantIntegration"
       WHERE "kind" = ${CHANNEL_KIND} AND "status" IN ('CONNECTED', 'ERROR') ORDER BY "createdAt" ASC, "id" ASC LIMIT 500`;
  } catch {
    console.warn("[hotel.channel] อ่านตัวต่อช่องทางไม่สำเร็จ");
    return out;
  }
  // ปุ่ม "ดึงการจองตอนนี้" = เฉพาะตัวต่อของร้าน/หน่วยผู้กด
  if (only) conns = conns.filter((c) => c.tenantId === only.tenantId && (!only.connectionIds || only.connectionIds.includes(c.id)));
  for (const c of conns) {
    if (Date.now() > deadline) break;
    try {
      const h = await handleOf(c.tenantId, c.id);
      if (!h) continue;
      const last = await scanDb().$queryRaw<{ m: Date | null }[]>`SELECT max("createdAt") AS "m" FROM "ChannelReservationInbox" WHERE "connectionId" = ${c.id} AND "tenantId" = ${c.tenantId}`;
      const since = last[0]?.m ?? new Date(now.getTime() - 86_400_000);
      const r = await callIntegration(h, "channel.pullReservations", (a, ctl) => a.pullReservations(since, { signal: ctl.signal, connectionId: c.id }));
      out.pulled++;
      if (r.ok && Array.isArray(r.value) && r.value.length) {
        const ing = await ingestInbound(c.id, r.value);
        if (!isFail(ing)) out.received += ing.received;
      }
      const pending = await scanDb().$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "ChannelReservationInbox" WHERE "connectionId" = ${c.id} AND "tenantId" = ${c.tenantId} AND "status" = 'RECEIVED'
         ORDER BY "externalId" ASC, "version" ASC, "createdAt" ASC LIMIT ${PULL_APPLY_MAX}`;
      for (const p of pending) {
        if (Date.now() > deadline) break;
        const a = await applyInbound(p.id);
        if (!isFail(a) && a.status === "APPLIED") out.applied++;
      }
    } catch {
      console.warn(`[hotel.channel] ดึงการจองจากตัวต่อ ${c.id} ไม่สำเร็จ — ลองรอบหน้า`);
    }
  }
  return out;
}

// ───────────────────────── คิวต้องจัดห้อง (มีผู้ใช้) ─────────────────────────
export type NeedsRoomItem = {
  id: string;
  connectionId: string;
  connectionLabel: string;
  externalId: string;
  version: number;
  status: string;
  reason: string | null;
  reasonTh: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  externalRoomId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  rooms: number;
  guestName: string | null;
  prepaid: boolean | null;
  receivedAt: string;
};
export type InboxItem = NeedsRoomItem & { reservationId: string | null };

async function inboxItems(g: { tenantId: string; unitId: string }, where: Prisma.ChannelReservationInboxWhereInput, take: number, withGuest: boolean): Promise<InboxItem[]> {
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const rows = await db.channelReservationInbox.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take });
  if (!rows.length) return [];
  const conns = await tenantDb({ tenantId: g.tenantId }).tenantIntegration.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.connectionId))] } }, select: { id: true, label: true } });
  const maps = await db.channelRoomMap.findMany({ where: { connectionId: { in: [...new Set(rows.map((r) => r.connectionId))] } }, select: { connectionId: true, externalRoomId: true, roomTypeId: true, roomType: { select: { name: true } } } });
  return rows.map((r) => {
    const raw = isRec(r.raw) ? r.raw : {};
    const ext = isStr(raw.externalRoomId) ? raw.externalRoomId : null;
    const guest = isRec(raw.guest) && isStr(raw.guest.name) ? raw.guest.name.slice(0, 120) : null;
    const reason = isStr(r.error) && r.error in INBOX_REASON_TH ? (r.error as InboxReason) : null;
    const map = maps.find((m) => m.connectionId === r.connectionId && m.externalRoomId === ext);
    return {
      id: r.id,
      connectionId: r.connectionId,
      connectionLabel: conns.find((c) => c.id === r.connectionId)?.label ?? "",
      externalId: r.externalId,
      version: r.version,
      status: r.status,
      reason,
      reasonTh: reason ? INBOX_REASON_TH[reason] : null,
      roomTypeId: map?.roomTypeId ?? null,
      roomTypeName: map?.roomType.name ?? null,
      externalRoomId: ext,
      checkIn: isYmd(raw.checkIn) ? raw.checkIn : null,
      checkOut: isYmd(raw.checkOut) ? raw.checkOut : null,
      rooms: typeof raw.rooms === "number" && Number.isInteger(raw.rooms) ? raw.rooms : 1,
      guestName: withGuest ? guest : null,
      prepaid: typeof raw.prepaid === "boolean" ? raw.prepaid : null,
      receivedAt: r.createdAt.toISOString(),
      reservationId: r.reservationId,
    };
  });
}

/** คิว "ต้องจัดห้อง" ของหน่วย (NEEDS_ROOM) — ชื่อแขกได้ · ไม่มีอีเมล/เบอร์/raw (§10.13) */
export async function listNeedsRoom(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; items: NeedsRoomItem[] } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const items = await inboxItems(g, { status: "NEEDS_ROOM" }, 200, true);
  return { ok: true, items: items.map(({ reservationId: _r, ...x }) => x) };
}

/** inbox ทุกสถานะของหน่วย (หน้า /hotel/channels/inbox) — NEEDS_ROOM ขึ้นก่อน · ไม่มีอีเมล/เบอร์/raw */
export async function listInbox(actor: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; items: InboxItem[] } | ChannelFail> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const items = await inboxItems(g, {}, 300, true);
  const rank = (s: string) => (s === "NEEDS_ROOM" ? 0 : s === "RECEIVED" ? 1 : 2);
  return { ok: true, items: [...items].sort((a, b) => rank(a.status) - rank(b.status)) };
}

const InboxRef = z.object({ inboxId: z.string().min(1) });
async function inboxOfUnit(g: { tenantId: string; unitId: string }, input: unknown): Promise<InboxRow | null> {
  const p = InboxRef.safeParse(input);
  if (!p.success) return null;
  const r = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).channelReservationInbox.findFirst({
    where: { id: p.data.inboxId },
    select: { id: true, tenantId: true, unitId: true, connectionId: true, externalId: true, version: true, status: true, reservationId: true, raw: true },
  });
  return r && r.tenantId === g.tenantId && r.unitId === g.unitId ? r : null;
}

/** ลองอีกครั้ง (หลังย้ายแขก/เปิดห้อง) — แถว NEEDS_ROOM/RECEIVED เท่านั้น · ผลตาม applyInbound */
export async function retryInbound(actor: unknown, ctx: unknown, input: unknown): Promise<ApplyResult> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const row = await inboxOfUnit(g, input);
  if (!row) return fail("NOT_FOUND", "ไม่พบรายการนี้ในคิวของโรงแรมนี้");
  if (row.status !== "NEEDS_ROOM" && row.status !== "RECEIVED") return fail("INVALID_STATUS", "รายการนี้จัดการไปแล้ว");
  const r = await applyInbound(row.id);
  if (!isFail(r)) {
    await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).auditLog.create({
      data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actor.userId, action: "hotel.channel.inbox.retry", targetType: "ChannelReservationInbox", targetId: row.id, after: { status: r.status, reason: r.reason } },
    });
  }
  return r;
}

const RejectInput = z.object({ inboxId: z.string().min(1), reason: z.string().trim().min(1, { message: "ระบุเหตุผลที่ปฏิเสธ" }).max(300) });
/** ปฏิเสธจากคิว (แจ้งเจ้าของผ่าน event · ตัวต่อจริงส่งปฏิเสธกลับ = เฟส H2) — เหตุผลลง AuditLog (ไม่ลง event) */
export async function rejectInbound(actor: unknown, ctx: unknown, input: unknown): Promise<ApplyResult> {
  const g = await channelGate(actor, ctx, input);
  if (isFail(g)) return g;
  const p = RejectInput.safeParse(input);
  if (!p.success) return fail("VALIDATION", p.error.issues[0]?.message && /[฀-๿]/.test(p.error.issues[0].message) ? p.error.issues[0].message : "ข้อมูลไม่ครบ");
  const row = await inboxOfUnit(g, input);
  if (!row) return fail("NOT_FOUND", "ไม่พบรายการนี้ในคิวของโรงแรมนี้");
  if (row.status !== "NEEDS_ROOM" && row.status !== "RECEIVED") return fail("INVALID_STATUS", "รายการนี้จัดการไปแล้ว");
  const moved = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    const u = await tx.channelReservationInbox.updateMany({ where: { id: row.id, tenantId: g.tenantId, unitId: g.unitId, status: { in: ["NEEDS_ROOM", "RECEIVED"] } }, data: { status: "REJECTED", error: "REJECTED_BY_STAFF" } });
    if (u.count === 0) return false;
    await emitOutbox(tx, { tenantId: g.tenantId, unitId: g.unitId, type: "channel.reservation.rejected", idempotencyKey: `channel.reservation.rejected#${row.id}`, payload: evPayload(row, { reason: "REJECTED_BY_STAFF" }) });
    await tx.auditLog.create({ data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actor.userId, action: "hotel.channel.inbox.reject", targetType: "ChannelReservationInbox", targetId: row.id, after: { reason: p.data.reason.slice(0, 300) } } });
    return true;
  });
  if (!moved) return fail("INVALID_STATUS", "รายการนี้จัดการไปแล้ว");
  await ack(row);
  return { ok: true, inboxId: row.id, status: "REJECTED", reservationId: null, reason: "REJECTED_BY_STAFF" };
}

// ───────────────────────── คิวทดสอบของ FAKE ─────────────────────────
const FAKE_CHANNEL_INBOUND_KEY = Symbol.for("shark.integrations.fake.channelInbound"); // ≡ providers/fake.ts
/** ป้อนการจองเข้าคิวทดสอบของตัวต่อ provider FAKE (ข้อสอบ/ฉาก · ในหน่วยความจำของโพรเซส) — ตัวต่ออื่น/ไม่เปิด FAKE ⇒ NOT_FOUND */
export async function fakeEnqueueInbound(connectionId: unknown, rows: unknown): Promise<{ ok: true; queued: number } | ChannelFail> {
  if (process.env.INTEGRATIONS_FAKE !== "1" || process.env.APP_ENV === "production") return fail("NOT_FOUND", R.notFound);
  const conn = await connectionById(connectionId);
  if (!conn || conn.provider !== "FAKE") return fail("NOT_FOUND", R.notFound);
  const list = (Array.isArray(rows) ? rows : []).filter(isRec).map((r) => JSON.parse(JSON.stringify(r)) as InboundReservation);
  const g = globalThis as unknown as Record<symbol, Map<string, InboundReservation[]> | undefined>;
  const m = g[FAKE_CHANNEL_INBOUND_KEY] ?? new Map<string, InboundReservation[]>();
  g[FAKE_CHANNEL_INBOUND_KEY] = m;
  m.set(conn.id, [...(m.get(conn.id) ?? []), ...list]);
  return { ok: true, queued: list.length };
}

/** ใช้ในหน้า: ตัวอย่างข้อความเหตุผล */
export const inboxReasonTh = (code: string | null | undefined): string | null => (code && code in INBOX_REASON_TH ? INBOX_REASON_TH[code as InboxReason] : null);
