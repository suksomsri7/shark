// ─────────────────────────────────────────────────────────────
// trips/sellable-impl.ts — `tripSellable: Sellable` (CC §C · N-8)
// T0.5: `quote` (→ quoteTrips) · T0.4: availability · capacityRowsOf · reserveInTx · T0.6: hold/confirm/cancel/finalizeInTx (ตอนนี้ปิดแบบล้ม KIND_NOT_SUPPORTED)
// ─────────────────────────────────────────────────────────────
import type { Sellable } from "@/lib/core/sellable";
import { reserveInTx, sellFail } from "./capacity";
import { capacityRowsOf, listAvailability } from "./capacity-service";
import { quoteTrips } from "./pricing";

const notYet = async () => sellFail("KIND_NOT_SUPPORTED", { reason: "NOT_IMPLEMENTED_YET" }, "ส่วนนี้ของการขายทัวร์ยังไม่เปิดใช้");

export const tripSellable: Sellable = {
  kind: "TRIP",
  quote: (ctx, req) => quoteTrips(ctx, req), // ── T0.5 pricing ──
  // ── T0.4 capacity ──
  availability: (ctx, q) => listAvailability(ctx, q),
  capacityRowsOf: (ctx, line) => capacityRowsOf(ctx, line),
  reserveInTx: (tx, ctx, rows, intent) => reserveInTx(tx, ctx, rows, intent),
  // ── /T0.4 capacity ──
  hold: notYet, // T0.6
  confirm: notYet, // T0.6
  cancel: notYet, // T0.6/T0.7
  finalizeInTx: notYet, // T0.6
};
