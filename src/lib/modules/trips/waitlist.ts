// ─────────────────────────────────────────────────────────────
// trips/waitlist.ts — รายการรอ: ฝากชื่อ · ออก · ปฏิเสธข้อเสนอ · เสนอที่ (FIFO เคร่ง) · รายการ · ทริกเกอร์จาก outbox · RUN TRIPS T0.4
// ใบสั่ง ledger/trips-briefs/T0.4.md §3.6 · ภาพ 07ก · X4
//
// 🔴 ทุกการเปลี่ยนรายการรอ: 1a ล็อกแถวรอบก่อน → 2a hold → 2a′ แถวรายการรอ (เรียง createdAt, id) · คนเดียว (partyId) มีแถว WAITING/OFFERED ได้แถวเดียวต่อรอบ
//    (บริการ + unique บางส่วนของ T0.1 เป็นด่านสุดท้าย) · ข้อเสนอ 1 ครั้งต่อแถว (คีย์ wl:<waitlistId>)
// 🔴 ไม่มีข้อมูลบุคคลในผล/event (X8) · tenantDb + $queryRaw เท่านั้น · ไม่มีการลบแถว
// ─────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { SellResult } from "@/lib/core/sellable";
import { WAITLIST_CHANNEL, publicLeftOf } from "./capacity-core";
import {
  CapacityAbort,
  ID,
  IDEM_KEY,
  QTY,
  audit,
  blockOf,
  gateOf,
  invalidInput,
  lockDeparture,
  offerNextInTx,
  parseCtx,
  policyFor,
  readDeparture,
  releaseLockedHold,
  runTx,
  sellFail,
  type Clock,
  type Ctx,
  type DepRow,
  type Policy,
  type Tx,
} from "./capacity";
import { systemGate } from "./resources";

// ── T0.4 capacity ──
type Gate = { tenantId: string; unitId: string; tz: string };
type WaitRow = { id: string; departureId: string; status: string; qty: number; offerHoldId: string | null; offerExpiresAt: Date | null; createdAt: Date };

async function readWait(db: Tx, g: Gate, id: string): Promise<WaitRow | null> {
  const rows = await db.$queryRaw<WaitRow[]>`
    SELECT "id", "departureId", "status", "qty", "offerHoldId", "offerExpiresAt", "createdAt" FROM "TripWaitlist"
    WHERE "id" = ${id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  return rows[0] ?? null;
}
const unitClient = (g: Gate) => tenantDb({ tenantId: g.tenantId, unitId: g.unitId }) as unknown as Tx;
function settle<T>(r: Awaited<ReturnType<typeof runTx<T>>>): SellResult<T> {
  return "race" in r ? sellFail("BUSY") : r;
}

/** ลำดับคิวของแถว WAITING (1 = หัวคิว) · แถวที่ไม่ WAITING = 0 */
async function positionOf(g: Gate, w: WaitRow): Promise<number> {
  if (w.status !== "WAITING") return 0;
  const rows = await unitClient(g).$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "TripWaitlist"
    WHERE "departureId" = ${w.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
      AND ("createdAt", "id") <= (${w.createdAt.toISOString()}::timestamp, ${w.id})`;
  return rows[0]?.n ?? 0;
}

// ═══════════════════════ ฝากชื่อ ═══════════════════════
const joinInput = z.strictObject({ departureId: ID, qty: QTY, partyId: ID, idempotencyKey: IDEM_KEY });
export type JoinValue = { waitlistId: string; status: string; position: number; duplicated: boolean };

/** ฝากชื่อเมื่อที่ไม่พอ · ยังมีที่พอ ⇒ STATE_CONFLICT (details.publicLeft · ไปถือแทน) · คนเดิมซ้ำ ⇒ แถวเดิม duplicated */
export async function joinWaitlist(ctx: unknown, input: unknown): Promise<SellResult<JoinValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const c = pc.c;
  const p = joinInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const v = p.data;
  const g = await gateOf(c);
  if (!g) return sellFail("NOT_FOUND");
  const d0 = await readDeparture(g, v.departureId);
  if (!d0) return sellFail("NOT_FOUND");
  const party = await tenantDb({ tenantId: g.tenantId }).party.findFirst({ where: { id: v.partyId }, select: { id: true } });
  if (!party) return sellFail("NOT_FOUND");
  const pol = await policyFor(g, d0, c.clock.now);
  const r = settle(
    await runTx(g, async (tx) => {
      const d = await lockDeparture(tx, g, v.departureId); // 1a
      if (!d) throw new CapacityAbort("NOT_FOUND");
      const mine = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "TripWaitlist"
        WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "partyId" = ${v.partyId} AND "status" IN ('WAITING', 'OFFERED')
        ORDER BY "createdAt", "id" LIMIT 1`;
      if (mine[0]) return { id: mine[0].id, duplicated: true };
      if (d.status !== "OPEN" && d.status !== "GUARANTEED" && d.status !== "FULL") throw new CapacityAbort("SLOT_CLOSED");
      const b = blockOf(d, pol, g.tz, WAITLIST_CHANNEL, c.clock.now, true);
      if (b === "STARTED" || b === "CUTOFF") throw new CapacityAbort("CUTOFF_PASSED");
      if (b !== null) throw new CapacityAbort("SLOT_CLOSED");
      const left = publicLeftOf(d);
      if (left >= v.qty) throw new CapacityAbort("STATE_CONFLICT", { publicLeft: left });
      const id = `tw_${randomUUID().replace(/-/g, "")}`;
      await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "TripWaitlist" ("id", "tenantId", "unitId", "departureId", "partyId", "channel", "qty", "status", "createdAt", "updatedAt")
        VALUES (${id}, ${g.tenantId}, ${g.unitId}, ${d.id}, ${v.partyId}, ${WAITLIST_CHANNEL}, ${v.qty}, 'WAITING', clock_timestamp(), clock_timestamp())
        RETURNING "id"`;
      await audit(tx, g, c, "trips.waitlist.join", "TripWaitlist", id, { departureId: d.id, qty: v.qty });
      return { id, duplicated: false };
    }),
  );
  if (!r.ok) return r;
  const w = await readWait(unitClient(g), g, r.value.id);
  if (!w) return sellFail("NOT_FOUND");
  return { ok: true, value: { waitlistId: w.id, status: w.status, position: await positionOf(g, w), duplicated: r.value.duplicated } };
}

// ═══════════════════════ ออก · ปฏิเสธข้อเสนอ ═══════════════════════
const refInput = z.strictObject({ waitlistId: ID });
export type ExitValue = { waitlistId: string; status: string; offered: string[] };

/** 1a ล็อกรอบ → (มีข้อเสนอ) 2a ปล่อย hold ของข้อเสนอ + แถวรายการรอ → 2a′ CAS แถว → เสนอคนถัดไปในทีเดียวกัน */
async function exitCore(tx: Tx, g: Gate, c: Ctx, waitlistId: string, mode: "LEAVE" | "DECLINE", pol: Policy): Promise<ExitValue> {
  const w0 = await readWait(tx, g, waitlistId);
  if (!w0) throw new CapacityAbort("NOT_FOUND");
  const d = await lockDeparture(tx, g, w0.departureId);
  if (!d) throw new CapacityAbort("NOT_FOUND");
  const w = await readWait(tx, g, waitlistId); // อ่านใต้ล็อกรอบ (ทุกผู้เขียนรายการรอล็อกรอบก่อน)
  if (!w) throw new CapacityAbort("NOT_FOUND");
  const allowed = mode === "DECLINE" ? ["OFFERED"] : ["WAITING", "OFFERED"];
  if (!allowed.includes(w.status)) throw new CapacityAbort("STATE_CONFLICT");
  const to = mode === "DECLINE" ? "DECLINED" : "CANCELLED";
  let dep: DepRow = d;
  if (w.status === "OFFERED" && w.offerHoldId) {
    const r = await releaseLockedHold(tx, g, c, d, w.offerHoldId, mode === "DECLINE" ? "ลูกค้าปฏิเสธข้อเสนอจากรายการรอ" : "ลูกค้าออกจากรายการรอ", to);
    dep = r.dep;
  }
  await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TripWaitlist" SET "status" = ${to}, "updatedAt" = now()
    WHERE "id" = ${w.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('WAITING', 'OFFERED')
    RETURNING "id"`;
  const o = await offerNextInTx(tx, g, dep, pol, c.clock);
  await audit(tx, g, c, "trips.waitlist.leave", "TripWaitlist", w.id, { departureId: d.id, status: to });
  return { waitlistId: w.id, status: to, offered: o.offered };
}
async function exitWaitlist(ctx: unknown, input: unknown, mode: "LEAVE" | "DECLINE"): Promise<SellResult<ExitValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = refInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const w = await readWait(unitClient(g), g, p.data.waitlistId);
  if (!w) return sellFail("NOT_FOUND");
  const d = await readDeparture(g, w.departureId);
  if (!d) return sellFail("NOT_FOUND");
  const pol = await policyFor(g, d, pc.c.clock.now);
  return settle(await runTx(g, (tx) => exitCore(tx, g, pc.c, p.data.waitlistId, mode, pol)));
}
/** WAITING/OFFERED → CANCELLED (มีข้อเสนอ ⇒ ปล่อย hold + เสนอคนถัดไป) */
export async function leaveWaitlist(ctx: unknown, input: unknown): Promise<SellResult<ExitValue>> {
  return exitWaitlist(ctx, input, "LEAVE");
}
/** OFFERED → DECLINED + hold RELEASED + เสนอคนถัดไป · แถว WAITING ⇒ STATE_CONFLICT */
export async function declineWaitlistOffer(ctx: unknown, input: unknown): Promise<SellResult<ExitValue>> {
  return exitWaitlist(ctx, input, "DECLINE");
}

// ═══════════════════════ เสนอที่ ═══════════════════════
const depInput = z.strictObject({ departureId: ID });
type OfferResult = { offered: string[]; expired: number };

/** ใต้ล็อกรอบ: ช่องทาง WEB ปิดรับ/เริ่มแล้ว หรือรอบยกเลิก ⇒ WAITING → EXPIRED · ไม่งั้นเสนอ FIFO เคร่ง */
async function offerCore(g: Gate, c: Ctx, departureId: string): Promise<SellResult<OfferResult>> {
  const d0 = await readDeparture(g, departureId);
  if (!d0) return sellFail("NOT_FOUND");
  const pol = await policyFor(g, d0, c.clock.now);
  return settle(
    await runTx(g, async (tx) => {
      const d = await lockDeparture(tx, g, departureId);
      if (!d) throw new CapacityAbort("NOT_FOUND");
      const b = blockOf(d, pol, g.tz, WAITLIST_CHANNEL, c.clock.now, true);
      if (d.status === "CANCELLED" || b === "STARTED" || b === "CUTOFF") {
        const ex = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "TripWaitlist" SET "status" = 'EXPIRED', "updatedAt" = now()
          WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
          RETURNING "id"`;
        return { offered: [], expired: ex.length };
      }
      const o = await offerNextInTx(tx, g, d, pol, c.clock);
      if (o.offered.length) await audit(tx, g, c, "trips.waitlist.offer", "TripDeparture", d.id, { offered: o.offered.length });
      return { offered: o.offered, expired: 0 };
    }),
  );
}
export async function offerWaitlist(ctx: unknown, input: unknown): Promise<SellResult<{ offered: string[] }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = depInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const r = await offerCore(g, pc.c, p.data.departureId);
  return r.ok ? { ok: true, value: { offered: r.value.offered } } : r;
}

/** งาน/consumer (SYSTEM) — หน่วยจากแถวรอบ (ไม่เชื่อ payload) */
export async function offerWaitlistForDeparture(tenantId: string, unitId: string, departureId: string, now: Date, job: string): Promise<OfferResult> {
  const g0 = await systemGate(tenantId, unitId);
  if (!g0) throw new CapacityAbort("NOT_FOUND");
  const g: Gate = { tenantId, unitId: g0.unitId, tz: g0.tz };
  const clock: Clock = { now, iso: now.toISOString() };
  const r = await offerCore(g, { tenantId, unitId: g.unitId, channel: WAITLIST_CHANNEL, actor: { kind: "SYSTEM", job }, clock }, departureId);
  if (!r.ok) throw new CapacityAbort(r.code);
  return r.value;
}

/** consumer ของ outbox (trips.hold.expired ฯลฯ): payload.departureId → แถวรอบของร้าน evt.tenantId → เสนอแบบ SYSTEM · ซ้ำ = ผลเดียว (X4) */
export async function onWaitlistTrigger(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const payload = evt.payload !== null && typeof evt.payload === "object" ? (evt.payload as Record<string, unknown>) : {};
  const departureId = payload.departureId;
  if (typeof evt.tenantId !== "string" || !evt.tenantId || typeof departureId !== "string" || !departureId) return;
  const rows = await tenantDb({ tenantId: evt.tenantId }).$queryRaw<{ unitId: string }[]>`
    SELECT "unitId" FROM "TripDeparture" WHERE "id" = ${departureId} AND "tenantId" = ${evt.tenantId}`;
  const unitId = rows[0]?.unitId;
  if (!unitId) return;
  await offerWaitlistForDeparture(evt.tenantId, unitId, departureId, new Date(), "trips.waitlistTrigger");
}

// ═══════════════════════ รายการ (ไม่มีข้อมูลบุคคล) ═══════════════════════
export type WaitlistItem = { id: string; qty: number; status: string; position: number | null; offerExpiresAt: string | null };
export async function listWaitlist(ctx: unknown, input: unknown): Promise<SellResult<{ items: WaitlistItem[] }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const p = depInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const d = await readDeparture(g, p.data.departureId);
  if (!d) return sellFail("NOT_FOUND");
  const rows = await unitClient(g).$queryRaw<WaitRow[]>`
    SELECT "id", "departureId", "status", "qty", "offerHoldId", "offerExpiresAt", "createdAt" FROM "TripWaitlist"
    WHERE "departureId" = ${d.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
    ORDER BY "createdAt", "id"`;
  let pos = 0;
  return {
    ok: true,
    value: {
      items: rows.map((w) => ({
        id: w.id,
        qty: w.qty,
        status: w.status,
        position: w.status === "WAITING" ? ++pos : null,
        offerExpiresAt: w.offerExpiresAt ? w.offerExpiresAt.toISOString() : null,
      })),
    },
  };
}
// ── /T0.4 capacity ──
