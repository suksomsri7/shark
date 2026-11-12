// ─────────────────────────────────────────────────────────────
// trips/sellable-impl.ts — `tripSellable: Sellable` (CC §C · N-8) · RUN TRIPS T0.4
// availability · capacityRowsOf · reserveInTx = จริง (T0.4) · quote = T0.5 · hold/confirm/cancel/finalizeInTx = T0.6 (ตอนนี้ KIND_NOT_SUPPORTED)
// 🔴 ผู้คุมรวมกับไฟล์ของเลน T0.5 ตอน merge: เก็บสมาชิกของ T0.4 + บรรทัด `quote` ของ T0.5
// ─────────────────────────────────────────────────────────────
import type { Sellable } from "@/lib/core/sellable";
import { capacityRowsOf, listAvailability, reserveInTx, sellFail } from "./capacity";

// ── T0.4 capacity ──
const notYet = async () => sellFail("KIND_NOT_SUPPORTED", { reason: "NOT_IMPLEMENTED_YET" });

export const tripSellable: Sellable = {
  kind: "TRIP",
  availability: (ctx, q) => listAvailability(ctx, q),
  quote: notYet, // T0.5
  hold: notYet, // T0.6
  confirm: notYet, // T0.6
  cancel: notYet, // T0.6/T0.7
  capacityRowsOf: (ctx, line) => capacityRowsOf(ctx, line),
  reserveInTx: (tx, ctx, rows, intent) => reserveInTx(tx, ctx, rows, intent),
  finalizeInTx: notYet, // T0.6
};
// ── /T0.4 capacity ──
