// ─────────────────────────────────────────────────────────────
// trips/sellable-impl.ts — `tripSellable: Sellable` (CC §C · N-8)
// T0.5: `quote` (→ quoteTrips) · T0.4: availability · capacityRowsOf · reserveInTx · T0.6: hold/confirm/cancel/finalizeInTx (→ booking.ts)
// ─────────────────────────────────────────────────────────────
import type { Sellable } from "@/lib/core/sellable";
import { cancelTripBooking, confirmTrips, finalizeTripsInTx, holdTrips } from "./booking";
import { reserveInTx } from "./capacity";
import { capacityRowsOf, listAvailability } from "./capacity-service";
import { quoteTrips } from "./pricing";

export const tripSellable: Sellable = {
  kind: "TRIP",
  // 🔴 quote / availability / capacityRowsOf ใช้ connection ของตัวเอง — ห้ามเรียกในธุรกรรม (เรียกก่อนเปิด tx ของตะกร้า · r3 N3)
  quote: (ctx, req) => quoteTrips(ctx, req), // ── T0.5 pricing ──
  // ── T0.4 capacity ──
  availability: (ctx, q) => listAvailability(ctx, q),
  capacityRowsOf: (ctx, line) => capacityRowsOf(ctx, line),
  reserveInTx: (tx, ctx, rows, intent) => reserveInTx(tx, ctx, rows, intent),
  // ── /T0.4 capacity ──
  // ── T0.6 booking ── hold/confirm/cancel คืน SellResult (ไม่ throw) · finalizeInTx = แกนข้อ 4–7 ในธุรกรรมของผู้เรียก (req.prepared จาก prepareTripConfirm)
  //   ช่องที่ core/sellable.ts ประกาศแต่ T0.6 ปฏิเสธด้วย VALIDATION (zod strict · มติ R14/S9) และใบที่จะเปิดรับ:
  //   HoldRequest.basketId (เติมตะกร้าเดิม) → K1.1 · HoldRequest.holdMinutes → ไม่เปิด (ระยะถือมาจากค่าตั้ง T5/X2 เท่านั้น)
  //   ConfirmRequest.note → T1.3 (จอการจอง · ต้องมีที่เก็บ) · pay.tender → T0.7 (รับเงิน) · Booker.marketingConsent → W1.x (หน้าจอง + ความยินยอม PDPA)
  //   passengers[].fields → T0.8 (แบบฟอร์มผู้เดินทาง) · CancelRequest.choice / moveToSlotId → T0.7 (คำขอคืนเงิน G.3)
  hold: (ctx, req) => holdTrips(ctx, req),
  confirm: (ctx, req) => confirmTrips(ctx, req),
  cancel: (ctx, req) => cancelTripBooking(ctx, req),
  finalizeInTx: (tx, ctx, reservations, req) => finalizeTripsInTx(tx, ctx, reservations, req),
  // ── /T0.6 booking ──
};
