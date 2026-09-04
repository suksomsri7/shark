"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatDateTh } from "@/lib/ui/date";
import { PAY_CHANNEL_LABEL } from "@/lib/ui/status-labels";
import {
  paymentPanelDataAction,
  recordPaymentsAction,
  voidPaymentV2Action,
} from "@/lib/modules/account/payment-actions";
import type { PaymentPanelData } from "@/lib/modules/account/payment";
import { SlideOver } from "./SlideOver";
import { PaymentSection, boxTieOff, newPayBox, textsFor, type PayBox } from "./PaymentSection";

// ─────────────────────────────────────────────────────────────
// PaymentPanel — แผง "รับชำระ / บันทึกจ่าย" ที่เปิดจากหน้าเอกสาร (§5.3 ปุ่ม action + §5.2 F)
// เนื้อในเป็น `PaymentSection` ตัวเดียวกับที่ฟอร์มใบเสร็จใช้ (ภาพ g2) ⇒ หน้าตา/ตัวเลขตรงกันเสมอ
// เพิ่มจากในฟอร์ม: ตาราง "การรับชำระที่บันทึกแล้ว" + ปุ่มยกเลิกรายชิ้น (ต้องกรอกเหตุผล)
// ─────────────────────────────────────────────────────────────

export function PaymentPanel({
  systemId,
  docId,
  triggerLabel,
  triggerClassName,
}: {
  systemId: string;
  docId: string;
  triggerLabel: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PaymentPanelData | null>(null);
  const [boxes, setBoxes] = useState<PayBox[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, startTransition] = useTransition();
  const [voidingId, setVoidingId] = useState("");
  const [voidReason, setVoidReason] = useState("บันทึกผิดรายการ");
  const keyRef = useRef("");

  const load = useCallback(
    (focusNew: boolean) =>
      startTransition(async () => {
        const d = await paymentPanelDataAction(systemId, docId);
        setData(d);
        if (d && focusNew) {
          const today = new Date().toISOString().slice(0, 10);
          setBoxes([newPayBox(today, d.outstanding, d.channels[0]?.id ?? null)]);
          keyRef.current = `pay-${docId}-${Date.now()}`;
        }
      }),
    [systemId, docId],
  );

  const openPanel = () => {
    setError("");
    setOk("");
    setOpen(true);
    load(true);
  };

  const submit = () =>
    startTransition(async () => {
      setError("");
      setOk("");
      const rows = boxes.filter((b) => boxTieOff(b) > 0);
      if (rows.length === 0) {
        setError("กรุณากรอกจำนวนเงินอย่างน้อย 1 ครั้ง");
        return;
      }
      const res = await recordPaymentsAction(
        systemId,
        docId,
        rows.map((b) => ({
          paidAt: b.paidAt,
          financeAccountId: b.financeAccountId,
          amountSatang: b.amountSatang,
          note: b.note,
          whtIncomeType: b.whtOn ? (b.whtIncomeType as never) : null,
          whtRateBp: b.whtOn ? b.whtRateBp : null,
          whtAmountSatang: b.whtOn ? b.whtAmountSatang : 0,
          feeSatang: b.feeSatang,
          cheque: b.chequeOn ? { chequeNo: b.chequeNo, bankName: b.bankName, chequeDate: b.chequeDate } : null,
        })),
        keyRef.current,
      );
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setOk(
        res.certNos.length > 0
          ? `บันทึกแล้ว ${res.recorded} ครั้ง · ออกเอกสารหัก ณ ที่จ่าย ${res.certNos.join(", ")}`
          : `บันทึกแล้ว ${res.recorded} ครั้ง`,
      );
      keyRef.current = `pay-${docId}-${Date.now()}`;
      load(true);
      router.refresh();
    });

  // ยกเลิกการชำระ = ต้องมีเหตุผลเสมอ (เข้า AuditLog + memo ของรายการกลับบัญชี)
  const confirmVoid = (paymentId: string) =>
    startTransition(async () => {
      setError("");
      const res = await voidPaymentV2Action(systemId, docId, paymentId, voidReason.trim() || "ยกเลิกการชำระ");
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setVoidingId("");
      setOk("ยกเลิกการชำระแล้ว (ระบบกลับรายการบัญชีให้อัตโนมัติ)");
      load(true);
      router.refresh();
    });

  const t = data ? textsFor(data.direction, data.docLabel) : null;

  return (
    <>
      <button type="button" className={triggerClassName ?? "btn btn-primary h-11 text-sm md:h-9"} onClick={openPanel} data-testid="btn-open-payment">
        {triggerLabel}
      </button>
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={`${t?.title ?? "รับชำระเงิน"} · ${data?.docNo ?? ""}`}
        testId="payment-slideover"
        actions={
          <button
            type="button"
            className="btn btn-primary h-11 text-sm md:h-9"
            onClick={submit}
            disabled={pending || !data?.canRecord}
            data-testid="btn-record-payments"
          >
            {pending ? "กำลังบันทึก…" : "บันทึกการชำระ"}
          </button>
        }
      >
        {error && <p className="mb-2 text-sm text-[color:var(--color-danger)]" data-testid="pay-error">{error}</p>}
        {ok && <p className="mb-2 text-sm text-[color:var(--color-accent)]" data-testid="pay-ok">{ok}</p>}
        {!data ? (
          <p className="text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.targetDocId !== data.docId && (
              <p className="text-xs text-[color:var(--color-muted)]">
                เงินที่รับจะไปตัดหนี้ที่ใบแจ้งหนี้ {data.targetDocNo ?? ""} (ลูกหนี้ตั้งไว้ที่ใบนั้น)
              </p>
            )}
            {!data.canRecord && (
              <p className="text-sm text-[color:var(--color-muted)]" data-testid="pay-closed">
                เอกสารนี้รับ/จ่ายชำระไม่ได้ในสถานะปัจจุบัน
              </p>
            )}
            {data.canRecord && (
              <PaymentSection
                value={boxes}
                onChange={setBoxes}
                advanced={advanced}
                onAdvancedChange={setAdvanced}
                channels={data.channels}
                direction={data.direction}
                docTotalSatang={data.grandTotal}
                alreadyPaidSatang={data.paidTotal}
                whtBaseSatang={data.whtBaseSatang}
                docTotalLabel={`ยอด${data.docLabel}`}
              />
            )}

            {data.payments.length > 0 && (
              <div className="card flex flex-col gap-2" data-testid="pay-history">
                <h3 className="text-sm font-semibold">การชำระที่บันทึกแล้ว</h3>
                {data.payments.map((p, i) => (
                  <div key={p.id} className="flex flex-col gap-1 border-b pb-1 text-sm last:border-0">
                   <div className="flex items-center justify-between gap-2">
                    <span className={p.voidedAt ? "line-through opacity-60" : ""}>
                      ครั้งที่ {i + 1} · {formatDateTh(p.paidAt.toString().slice(0, 10))} ·{" "}
                      {p.financeName ?? PAY_CHANNEL_LABEL[p.channel as keyof typeof PAY_CHANNEL_LABEL] ?? p.channel}
                      {p.chequeNo ? ` · เช็ค ${p.chequeNo}` : ""}
                      {p.certNo ? ` · ${p.certNo}` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        <MoneyText satang={p.amount + p.whtAmount} decimals />
                      </span>
                      {!p.voidedAt && (
                        <button
                          type="button"
                          className="text-xs text-[color:var(--color-danger)] underline"
                          onClick={() => {
                            setVoidingId(p.id);
                            setVoidReason("บันทึกผิดรายการ");
                          }}
                          data-testid={`pay-void-${i + 1}`}
                        >
                          ยกเลิก
                        </button>
                      )}
                    </span>
                   </div>
                   {voidingId === p.id && (
                     <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2" data-testid={`pay-void-confirm-${i + 1}`}>
                       <label className="flex-1 text-xs text-[color:var(--color-muted)]">
                         เหตุผลการยกเลิก
                         <input
                           className="input mt-1"
                           maxLength={200}
                           value={voidReason}
                           onChange={(e) => setVoidReason(e.target.value)}
                           data-testid={`pay-void-reason-${i + 1}`}
                         />
                       </label>
                       <button type="button" className="btn-sm" onClick={() => setVoidingId("")}>
                         ไม่ยกเลิก
                       </button>
                       <button
                         type="button"
                         className="btn-sm"
                         style={{ color: "var(--color-danger)" }}
                         disabled={pending}
                         onClick={() => confirmVoid(p.id)}
                         data-testid={`pay-void-confirm-btn-${i + 1}`}
                       >
                         ยืนยันยกเลิก
                       </button>
                     </div>
                   )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </>
  );
}

export default PaymentPanel;
