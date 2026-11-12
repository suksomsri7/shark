// ─────────────────────────────────────────────────────────────
// trips/waitlist.ts — รายการรอ (ตัวห่อ): ฝากชื่อ · ออก · ปฏิเสธข้อเสนอ · เสนอที่ (FIFO เคร่ง) · รายการ · ทริกเกอร์จาก outbox · RUN TRIPS T0.4 r2
// ใบสั่ง ledger/trips-briefs/T0.4.md §3.6 · ภาพ 07ก · X4 · ส่วนในธุรกรรมอยู่ capacity.ts (joinWaitlistTx · exitWaitlistTx · offerWaitlistTx)
//
// 🔴 ทุกการเปลี่ยนรายการรอ: 1a ล็อกแถวรอบก่อน → 2a hold → 2a′ แถวรายการรอ (เรียง createdAt, id) · คนเดียว (partyId) มีแถว WAITING/OFFERED
//    ได้แถวเดียวต่อรอบ (บริการ + unique บางส่วนของ T0.1 เป็นด่านสุดท้าย) · ข้อเสนอ 1 ครั้งต่อแถว (คีย์ wl:<waitlistId>)
// 🔴 r2 ข้อ 9: ตาราง TripWaitlist ไม่มีคอลัมน์ความลับของผู้ฝาก ⇒ ผู้กระทำ PUBLIC ออก/ปฏิเสธ/ดูรายการไม่ได้ (FORBIDDEN) จน T1/W1 เพิ่ม token
// 🔴 ค่าตั้งอ่านก่อนเปิด tx (capacity-service) · ไม่มีข้อมูลบุคคลในผล/event (X8) · ไม่มีการลบแถว
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { SellResult } from "@/lib/core/sellable";
import { WAITLIST_CHANNEL } from "./capacity-core";
import {
  CapacityAbort,
  ID,
  IDEM_KEY,
  QTY,
  exitWaitlistTx,
  invalidInput,
  joinWaitlistTx,
  offerWaitlistTx,
  parseCtx,
  readWait,
  sellFail,
  staffOnly,
  type CapacityPolicies,
  type Ctx,
  type ExitValue,
  type Gate,
  type OfferResult,
  type WaitRow,
} from "./capacity";
import { CapacitySettingsInvalid, gateOf, policiesFor, runTx, unitClient } from "./capacity-service";

// ── T0.4 capacity ──
/** ลำดับคิวของแถว WAITING (1 = หัวคิว) · แถวที่ไม่ WAITING = 0 */
async function positionOf(g: Gate, w: WaitRow): Promise<number> {
  if (w.status !== "WAITING") return 0;
  const rows = await unitClient(g).$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "TripWaitlist"
    WHERE "departureId" = ${w.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'
      AND ("createdAt", "id") <= (${w.createdAt.toISOString()}::timestamp, ${w.id})`;
  return rows[0]?.n ?? 0;
}
async function depPolicies(g: Gate, departureId: string, now: Date, strict: boolean): Promise<CapacityPolicies | undefined | "NOT_FOUND" | CapacitySettingsInvalid> {
  const deps = await unitClient(g).$queryRaw<{ id: string; productId: string }[]>`
    SELECT "id", "productId" FROM "TripDeparture" WHERE "id" = ${departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  if (!deps.length) return "NOT_FOUND";
  try {
    return await policiesFor(g, deps, now);
  } catch (e) {
    if (e instanceof CapacitySettingsInvalid) return strict ? e : undefined;
    throw e;
  }
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
  const pol = await depPolicies(g, v.departureId, c.clock.now, true);
  if (pol === "NOT_FOUND") return sellFail("NOT_FOUND");
  if (pol instanceof CapacitySettingsInvalid) return sellFail("VALIDATION", { reason: "SETTINGS_INVALID", key: pol.key });
  const policy = pol?.departures[v.departureId];
  if (!policy) return sellFail("NOT_FOUND");
  const party = await tenantDb({ tenantId: g.tenantId }).party.findFirst({ where: { id: v.partyId }, select: { id: true } });
  if (!party) return sellFail("NOT_FOUND");
  const r = await runTx(g, (tx) => joinWaitlistTx(tx, g, c, v, policy));
  if (!r.ok) return r;
  const w = await readWait(unitClient(g), g, r.value.id);
  if (!w) return sellFail("NOT_FOUND");
  return { ok: true, value: { waitlistId: w.id, status: w.status, position: await positionOf(g, w), duplicated: r.value.duplicated } };
}

// ═══════════════════════ ออก · ปฏิเสธข้อเสนอ (ร้านเท่านั้น จนมี token ของผู้ฝาก) ═══════════════════════
const refInput = z.strictObject({ waitlistId: ID });
async function exitWaitlist(ctx: unknown, input: unknown, mode: "LEAVE" | "DECLINE"): Promise<SellResult<ExitValue>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const so = staffOnly(pc.c);
  if (so) return so;
  const p = refInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const w = await readWait(unitClient(g), g, p.data.waitlistId);
  if (!w) return sellFail("NOT_FOUND");
  const pol = await depPolicies(g, w.departureId, pc.c.clock.now, false); // ค่าตั้งเสีย ⇒ ออกได้ แต่ไม่เสนอคนถัดไป
  if (pol === "NOT_FOUND") return sellFail("NOT_FOUND");
  const policy = pol instanceof CapacitySettingsInvalid ? null : (pol?.departures[w.departureId] ?? null);
  return runTx(g, (tx) => exitWaitlistTx(tx, g, pc.c, p.data.waitlistId, mode, policy));
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
async function offerCore(g: Gate, c: Ctx, departureId: string): Promise<SellResult<OfferResult>> {
  const pol = await depPolicies(g, departureId, c.clock.now, false); // ค่าตั้งเสีย ⇒ หมดอายุแถวของรอบที่เริ่ม/ยกเลิกได้ แต่ไม่เสนอ
  if (pol === "NOT_FOUND") return sellFail("NOT_FOUND");
  const policy = pol instanceof CapacitySettingsInvalid ? null : (pol?.departures[departureId] ?? null);
  return runTx(g, (tx) => offerWaitlistTx(tx, g, c, departureId, policy));
}
export async function offerWaitlist(ctx: unknown, input: unknown): Promise<SellResult<{ offered: string[] }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const so = staffOnly(pc.c);
  if (so) return so;
  const p = depInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const r = await offerCore(g, pc.c, p.data.departureId);
  return r.ok ? { ok: true, value: { offered: r.value.offered } } : r;
}

/** งาน/consumer (SYSTEM) — หน่วยจากแถวรอบ (ไม่เชื่อ payload) */
export async function offerWaitlistForDeparture(tenantId: string, unitId: string, departureId: string, now: Date, job: string): Promise<OfferResult> {
  const g = await gateOf({ tenantId, unitId });
  if (!g) throw new CapacityAbort("NOT_FOUND");
  const r = await offerCore(g, { tenantId, unitId: g.unitId, channel: WAITLIST_CHANNEL, actor: { kind: "SYSTEM", job }, clock: { now, iso: now.toISOString() } }, departureId);
  if (!r.ok) throw new CapacityAbort(r.code, r.details);
  return r.value;
}

/** consumer ของ outbox (trips.hold.expired ฯลฯ): payload.departureId → แถวรอบของร้าน evt.tenantId → เสนอแบบ SYSTEM (นาฬิกาจริง) · ซ้ำ = ผลเดียว (X4) */
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

// ═══════════════════════ รายการ (ร้านเท่านั้น · ไม่มีข้อมูลบุคคล) ═══════════════════════
export type WaitlistItem = { id: string; qty: number; status: string; position: number | null; offerExpiresAt: string | null };
export async function listWaitlist(ctx: unknown, input: unknown): Promise<SellResult<{ items: WaitlistItem[] }>> {
  const pc = parseCtx(ctx);
  if (!pc.ok) return pc;
  const so = staffOnly(pc.c);
  if (so) return so;
  const p = depInput.safeParse(input);
  if (!p.success) return invalidInput(p.error);
  const g = await gateOf(pc.c);
  if (!g) return sellFail("NOT_FOUND");
  const dep = await unitClient(g).$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripDeparture" WHERE "id" = ${p.data.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}`;
  if (!dep.length) return sellFail("NOT_FOUND");
  const rows = await unitClient(g).$queryRaw<WaitRow[]>`
    SELECT "id", "departureId", "status", "qty", "offerHoldId", "offerExpiresAt", "createdAt" FROM "TripWaitlist"
    WHERE "departureId" = ${p.data.departureId} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId}
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
