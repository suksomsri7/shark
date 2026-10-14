"use client";

// OrderPay.tsx — "รับเงิน" ของออเดอร์ช่องทางที่ร้านเก็บเงินเอง (POS P2.8U · มติ 5) = จอชำระเดิมของหน้าขาย (PayDialog) ผูกกับ payOrderAction
//   ยอด = OrderDetail.totalSatang ของเซิร์ฟเวอร์ (ไม่มี quote · ไม่มีทิป · ไม่มีส่วนลด/สมาชิก/ใบกำกับในกล่องนี้) · พร้อมเพย์ = QR นิ่ง + ยืนยันเองแบบ P1.6
//     (ใบขอรับเงิน P1.7 ผูกกับตะกร้าของหน้าขาย — payOrder ไม่รับใบ ⇒ intent = null · deviation)
//   🔴 คีย์กันซ้ำ 1 คีย์ต่อการเปิดกล่อง (ผู้เรียกสร้าง `key` ตอนเปิด · มติ 5) · ผลไม่แน่ใจ = ลองซ้ำด้วยชุดเดิมคีย์เดิม
//   🔴 เงินสดไม่มีกะของเครื่อง = SHIFT_REQUIRED (ข้อความจาก refusalMessageKey) · ข้อความผิดพลาดจากคีย์เท่านั้น
//   fix 1 F1: managerOnly (manualConfirmRequiresManager · ไม่มี pos.shift.manage) ⇒ ไม่ส่ง promptpayId (ไม่มี QR นิ่ง · ช่องพร้อมเพย์ปิด) +
//     บัตร EDC ยืนยันไม่ได้ (PayDialog manualManagerOnly · คำใบ้ pay.intent.managerOnly ของ HF-PP) · คำปฏิเสธด่านผู้จัดการของเซิร์ฟเวอร์ = refusal.manualConfirmManager

import { useRef, useState } from "react";
import { payOrderAction } from "@/lib/modules/pos/order-actions";
import type { OrderDetail, OrderRefusal } from "@/lib/modules/pos/order-shared";
import { REGISTER_MAX_PAY_METHODS, submitRefusalMessageKey } from "@/lib/modules/pos/register-shared";
import { PayDialog, type PayChoice, type PayError, type PayPhase } from "@/components/pos/register/InterimPayDialog";

type Req = { payMethods: PayChoice["payMethods"]; cashReceivedSatang?: number };

export function OrderPay(p: {
  systemId: string;
  unitId: string;
  deviceId: string | undefined;
  order: OrderDetail;
  idempotencyKey: string;
  promptpayId: string | null;
  /** fix 1 F1 */
  managerOnly: boolean;
  salesHref: string;
  onPaid: (saleId: string, duplicated: boolean) => void;
  /** คำปฏิเสธที่ทำให้กล่องนี้ใช้ต่อไม่ได้ (สถานะเปลี่ยน · ไม่พบ) — ผู้เรียกปิดกล่อง + แจ้ง + โหลดใหม่ */
  onGone: (r: OrderRefusal) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<PayPhase>("form");
  const [error, setError] = useState<PayError | null>(null);
  const pending = useRef<Req | null>(null);
  const sending = useRef(false);
  const due = p.order.totalSatang;

  const send = async (req: Req) => {
    if (sending.current) return;
    sending.current = true;
    pending.current = req;
    setPhase("sending");
    setError(null);
    try {
      const r = await payOrderAction({ systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}), id: p.order.id, idempotencyKey: p.idempotencyKey, ...req });
      if (r.ok) {
        pending.current = null;
        setPhase("form");
        p.onPaid(r.saleId, !!r.duplicated);
        return;
      }
      if (r.code === "INTERNAL" || r.code === "UNKNOWN" || r.code === "BUSY") {
        setPhase("unknown"); // ไม่รู้ว่าบันทึกแล้วหรือยัง — ลองซ้ำคีย์เดิม
        return;
      }
      pending.current = null;
      setPhase("form");
      if (r.code === "ORDER_STATE_CHANGED" || r.code === "ORDER_STATE_INVALID" || r.code === "ORDER_NOT_FOUND") {
        p.onGone(r);
        return;
      }
      setError({ code: r.code, key: submitRefusalMessageKey(r) }); // fix 1 F1: ด่านผู้จัดการ = refusal.manualConfirmManager (HF-PP) · อื่น ๆ = refusalMessageKey
    } catch {
      setPhase("unknown");
    } finally {
      sending.current = false;
    }
  };

  const confirm = (c: PayChoice) => {
    if (sending.current || phase !== "form") return;
    const sum = c.payMethods.reduce((s, m) => s + m.amountSatang, 0);
    if (sum !== due || c.payMethods.some((m) => m.amountSatang <= 0) || c.payMethods.length > REGISTER_MAX_PAY_METHODS) return;
    const cash = c.payMethods.find((m) => m.type === "CASH");
    if (cash && (c.cashReceivedSatang ?? 0) < cash.amountSatang) return;
    void send({ payMethods: c.payMethods, ...(cash ? { cashReceivedSatang: c.cashReceivedSatang } : {}) });
  };

  return (
    <div data-testid="pos-ord-pay-dialog" data-phase={phase} className="contents">
      <PayDialog
        dueSatang={due}
        breakdown={null}
        quotePending={false}
        quoteError={null}
        itemCount={p.order.lines.length}
        promptpayId={p.managerOnly ? null : p.promptpayId}
        tipEnabled={false}
        billNote={null}
        phase={phase}
        error={error}
        conflict={null}
        salesHref={p.salesHref}
        onConfirm={confirm}
        onRetry={() => {
          if (pending.current) void send(pending.current); // ชุดเดิม · คีย์เดิม
        }}
        onClose={() => {
          if (phase === "form") p.onClose();
        }}
        onNewBill={p.onClose}
        intent={null}
        platform={null}
        taxInvoice={null}
        manualManagerOnly={p.managerOnly}
      />
    </div>
  );
}
