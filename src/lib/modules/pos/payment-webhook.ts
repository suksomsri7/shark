// payment-webhook.ts — facade ของ webhook Beam ฝั่ง POS (P1.7 R3a) · route /api/payment/beam/webhook เรียกที่แขนง "pos-"
//
// 🔴 ไม่โยนทุกกรณี (route ต้องตอบ Beam ได้เสมอ) · อ้างอิงที่ไม่รู้จัก = รับทราบเงียบ ๆ (ไม่บอกคนนอกว่ารู้จัก ref ไหน)
// 🔴 ลายเซ็นตรวจที่ route แล้ว (401 เมื่อผิด) — ที่นี่ตัดสินเฉพาะเนื้อหา
// มติ G: (b) chargeId ไม่ตรงกับ beamChargeId ของใบ = ไม่ทำอะไร + ops WARN · (c) webhook ของใบ QR นิ่ง (ไม่มี charge ของ Beam) = ไม่ทำอะไร + ops WARN

import { prisma } from "./db";
import { logOps } from "@/lib/core/ops";
import { markIntentPaid } from "./payment-intent";
import { isPaymentIntentId, type MarkIntentPaidResult } from "./payment-intent-shared";

/** คำนำหน้า referenceId ของ POS (ต้องตรงกับ POS_BEAM_REF_PREFIX ที่ payment-intent ส่งให้ Beam) */
const POS_REF_PREFIX = "pos-";
const SUCCEEDED = new Set(["SUCCEEDED", "SUCCESS", "PAID", "COMPLETED"]);

export type BeamWebhookEvent = { referenceId: string; chargeId: string; status: string; amountSatang: number; raw?: string };
export type BeamWebhookOutcome = MarkIntentPaidResult | { ok: true; ignored: string } | { ok: false; code: "INTERNAL"; message: string };

/** ผลของ webhook ที่อ้าง "pos-<intent id>" → markIntentPaid เมื่อสถานะสำเร็จ · สถานะอื่น = ไม่ทำอะไร (ใบยัง PENDING) */
export async function onBeamWebhookEvent(ev: BeamWebhookEvent | null | undefined): Promise<BeamWebhookOutcome> {
  try {
    if (!ev || typeof ev !== "object") return { ok: true, ignored: "bad_input" };
    const ref = typeof ev.referenceId === "string" ? ev.referenceId : "";
    if (!ref.startsWith(POS_REF_PREFIX)) return { ok: true, ignored: "not_pos" };
    const intentId = ref.slice(POS_REF_PREFIX.length);
    if (!isPaymentIntentId(intentId)) return { ok: true, ignored: "unknown_reference" };
    const status = String(ev.status ?? "").toUpperCase();
    if (!SUCCEEDED.has(status)) return { ok: true, ignored: status || "no_status" };
    const row = await prisma.posPaymentIntent.findUnique({ where: { id: intentId }, select: { id: true, tenantId: true, kind: true, beamChargeId: true } });
    if (!row) return { ok: true, ignored: "unknown_reference" };
    const chargeId = typeof ev.chargeId === "string" ? ev.chargeId : "";
    if (row.kind === "PROMPTPAY_STATIC" || !row.beamChargeId) {
      await logOps("WARN", "pos.payment", "pos.payment.webhook_ignored — webhook ของใบขอรับเงินแบบ QR นิ่ง (ไม่มี charge ของ Beam) ไม่ยืนยันให้", {
        tenantId: row.tenantId,
        detail: `intent ${row.id} · charge ${chargeId || "-"} · status ${status}`,
      });
      return { ok: true, ignored: "static_intent" };
    }
    if (chargeId !== row.beamChargeId) {
      await logOps("WARN", "pos.payment", "pos.payment.charge_mismatch — chargeId ใน webhook ไม่ตรงกับใบขอรับเงิน ไม่ยืนยันให้", {
        tenantId: row.tenantId,
        detail: `intent ${row.id} · charge ที่แจ้ง ${chargeId || "-"} · status ${status}`,
      });
      return { ok: true, ignored: "charge_mismatch" };
    }
    const amount = typeof ev.amountSatang === "number" ? ev.amountSatang : Number.NaN;
    return await markIntentPaid(intentId, { via: "WEBHOOK", beamRef: chargeId, amountSatang: amount });
  } catch (e) {
    console.error("[pos/payment-webhook] onBeamWebhookEvent", e);
    return { ok: false, code: "INTERNAL", message: "ระบบรับเงินขัดข้องชั่วคราว" };
  }
}
