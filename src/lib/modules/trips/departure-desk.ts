// ─────────────────────────────────────────────────────────────
// trips/departure-desk.ts — ตัดสินรอบต่ำกว่าขั้นต่ำ (ภาพ 11 การ์ด "ต้องตัดสินใจ" · RUN TRIPS T1.2 §6)
//   RUN = ออกขาดทุน (→ GUARANTEED) · CANCEL = ยกเลิก + เหตุผล · MERGE = รวมกับรอบอื่นวันเดียวกัน (รอบนี้ต้องว่าง ⇒ ยกเลิกพร้อมเหตุผลชี้เป้า)
// 🔴 เขียนผ่าน setDepartureStatus / cancelDeparture ของ T0.3 เท่านั้น (ไม่มี SQL เขียนเอง · event/audit มาจากบริการ T0.3)
// 🔴 รวมรอบที่มีคน (ขาย/ถือ/โควตา > 0) ต้องย้ายการจอง ⇒ MERGE_NEEDS_BOOKINGS ก่อนเขียนอะไร (ย้ายจริง = T1.6)
// ⚠️ พร้อมกัน: RUN แล้ว CANCEL ที่ผ่านด่านก่อนหน้าสำเร็จได้ทั้งคู่ (T0.3 ยอม GUARANTEED → CANCELLED) — ผลสุดท้าย GUARANTEED หรือ CANCELLED เสมอ
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { cancelDeparture, setDepartureStatus } from "./departures";
import { hhmm, utcToLocal } from "./departures-core";
import { gateUnit, isFail, unitDb, type TripCtx, type TripOpts } from "./resources";
import { departureCellState, isMergeTarget } from "./departure-view-core";

export const DEPARTURE_DESK_ERROR_CODES = ["NOT_BELOW_MIN", "MERGE_NEEDS_BOOKINGS", "MERGE_TARGET_INVALID"] as const;
export type DepartureDeskErrorCode = (typeof DEPARTURE_DESK_ERROR_CODES)[number];
export const DEPARTURE_DESK_MESSAGES: Record<DepartureDeskErrorCode, string> = {
  NOT_BELOW_MIN: "รอบนี้ไม่ได้อยู่ในสถานะต่ำกว่าขั้นต่ำแล้ว — โหลดหน้าใหม่แล้วดูอีกครั้ง",
  MERGE_NEEDS_BOOKINGS: "รอบที่มีผู้จองยังรวมไม่ได้ — ต้องย้ายการจองไปรอบอื่น ซึ่งยังไม่เปิดใช้",
  MERGE_TARGET_INVALID: "รอบที่เลือกรับรวมไม่ได้ — ต้องเป็นรอบวันเดียวกันที่ยังเปิดขายและมีที่ว่างพอ",
};
type DeskFail = { ok: false; code: string; message: string; used?: number };
const deskFail = (code: DepartureDeskErrorCode | "INVALID_INPUT" | "NOT_FOUND", message?: string): DeskFail => ({
  ok: false,
  code,
  message: message ?? (code === "INVALID_INPUT" ? "ข้อมูลไม่ถูกต้อง" : code === "NOT_FOUND" ? "ไม่พบรายการ" : DEPARTURE_DESK_MESSAGES[code]),
});

const ID = z.string().trim().min(1).max(128);
const REASON = z.string().trim().min(3).max(500);
const INPUT = z
  .strictObject({
    unitId: ID,
    departureId: ID,
    decision: z.enum(["RUN", "CANCEL", "MERGE"]),
    reason: REASON.optional(),
    targetDepartureId: ID.optional(),
  })
  .refine((v) => v.decision !== "CANCEL" || v.reason !== undefined, { message: "ยกเลิกต้องมีเหตุผล" })
  .refine((v) => (v.decision === "MERGE") === (v.targetDepartureId !== undefined), { message: "รวมรอบต้องเลือกเป้า (และส่งเป้าได้เฉพาะรวมรอบ)" });

const DEP_SELECT = { id: true, productId: true, localDate: true, startsAt: true, status: true, capacity: true, sold: true, held: true, reserved: true, minPax: true } as const;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** รหัสเหตุผลรวมรอบ (ตัด "|" ในชื่อ/หมายเหตุ · ยาวไม่เกิน 500) */
export function mergeReasonCode(hm: string, title: string, note?: string): string {
  const clean = (x: string) => x.replace(/\|/g, "/").trim();
  return `merge:${hm}|${clean(title)}${note ? `|${clean(note)}` : ""}`.slice(0, 500);
}

export type DecideBelowMinResult = { ok: true; decision: "RUN" | "CANCEL" | "MERGE"; status: string } | DeskFail;

/** ตัดสินรอบต่ำกว่าขั้นต่ำ — ด่าน gateUnit "status" ของ T0.3 (ไม่มี trips.departure.status ⇒ FORBIDDEN) */
export async function decideBelowMin(ctx: TripCtx, input: unknown, opts?: TripOpts): Promise<DecideBelowMinResult> {
  const unitId = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as { unitId?: unknown }).unitId : undefined;
  const g = await gateUnit(ctx, unitId, "status");
  if (isFail(g)) return g;
  const p = INPUT.safeParse(input);
  if (!p.success) return deskFail("INVALID_INPUT", p.error.issues[0]?.message);
  const v = p.data;
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  const today = utcToLocal(g.tz, now).ymd;
  const db = unitDb(g);
  const row = await db.tripDeparture.findFirst({ where: { id: v.departureId, tenantId: g.tenantId, unitId: g.unitId }, select: DEP_SELECT });
  if (!row) return deskFail("NOT_FOUND");
  const src = { ...row, localDate: ymd(row.localDate) };
  if (departureCellState(src, { now, today, lowAtOrBelow: null }) !== "BELOW_MIN") return deskFail("NOT_BELOW_MIN");

  if (v.decision === "RUN") {
    const r = await setDepartureStatus(ctx, { unitId: g.unitId, departureId: row.id, status: "GUARANTEED" }, opts);
    return r.ok ? { ok: true, decision: "RUN", status: r.status } : r;
  }
  if (v.decision === "CANCEL") {
    const r = await cancelDeparture(ctx, { unitId: g.unitId, departureId: row.id, reason: v.reason ?? "" }, opts);
    return r.ok ? { ok: true, decision: "CANCEL", status: r.status } : r;
  }
  // MERGE
  const used = row.sold + row.held + row.reserved;
  if (used > 0) return { ...deskFail("MERGE_NEEDS_BOOKINGS"), used };
  const tgt = await db.tripDeparture.findFirst({ where: { id: v.targetDepartureId ?? "", tenantId: g.tenantId, unitId: g.unitId }, select: DEP_SELECT });
  if (!tgt) return deskFail("NOT_FOUND");
  const product = await db.tripProduct.findFirst({ where: { id: tgt.productId, tenantId: g.tenantId, unitId: g.unitId }, select: { title: true, status: true } });
  const tgtView = { ...tgt, localDate: ymd(tgt.localDate) };
  if (!product || product.status === "ARCHIVED" || !isMergeTarget(src, tgtView, { now, today })) return deskFail("MERGE_TARGET_INVALID");
  const title = typeof product.title === "object" && product.title !== null && !Array.isArray(product.title) && typeof (product.title as { th?: unknown }).th === "string" ? String((product.title as { th: string }).th) : "";
  // เหตุผลเก็บเป็นรหัสที่จอแปลตามภาษาผู้ดู: "merge:<HH:MM>|<ชื่อเป้า>[|<หมายเหตุ>]" (คอลัมน์ T0.3 เป็นข้อความอิสระ · ค่าที่จอไม่รู้จัก ⇒ แสดงตรงตัว)
  const reason = mergeReasonCode(hhmm(utcToLocal(g.tz, tgt.startsAt).minutes), title, v.reason);
  const r = await cancelDeparture(ctx, { unitId: g.unitId, departureId: row.id, reason }, opts);
  return r.ok ? { ok: true, decision: "MERGE", status: r.status } : r;
}
