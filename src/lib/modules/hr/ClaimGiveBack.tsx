"use client";

// HR H3.7 ▸ fix r2 (b): ปุ่ม "คืนเงิน" ที่แถวรายการหักที่หักในรอบจ่ายแล้ว — สร้างรายการคืนเงิน (REFUND) ที่อ้างรายการหักนี้
//   ⇒ ตอนลงบัญชี ระบบรู้ว่าคืนค่าเสียหายหรือเงินที่จ่ายเกิน (เดบิตบัญชีเดียวกับตอนหัก) · ผลการกดแสดงในแถว (ข้อความคงที่จาก service) ◂
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { giveBackClaimAction } from "./payroll-actions";

type Res = { ok: boolean; reason?: string } | null;

export default function ClaimGiveBack({ systemId, claimId, defaultPeriod }: { systemId: string; claimId: string; defaultPeriod: string }) {
  const [state, run] = useActionState<Res, FormData>((_prev, fd) => giveBackClaimAction(fd), null);
  return (
    <details className="text-xs" data-testid={`hr-pay-giveback-${claimId}`}>
      <summary className="min-h-[44px] cursor-pointer py-2">คืนเงิน</summary>
      <form action={run} className="mt-1 flex flex-wrap items-end gap-2">
        <input type="hidden" name="systemId" value={systemId} />
        <input type="hidden" name="claimId" value={claimId} />
        <label className="flex flex-col">
          จำนวน (บาท)
          <input name="amount" inputMode="decimal" required className="input min-h-[44px] w-28" data-testid={`hr-pay-giveback-${claimId}-amount`} />
        </label>
        <label className="flex flex-col">
          งวดที่คืน
          <input name="periodKey" defaultValue={defaultPeriod} pattern="\d{4}-\d{2}" required className="input min-h-[44px] w-28" data-testid={`hr-pay-giveback-${claimId}-period`} />
        </label>
        <SubmitButton variant="ghost" data-testid={`hr-pay-giveback-${claimId}-submit`}>
          บันทึกคืนเงิน
        </SubmitButton>
      </form>
      {state && (
        <p role={state.ok ? "status" : "alert"} className="mt-1" data-testid={`hr-pay-giveback-${claimId}-result`}>
          {state.ok ? "บันทึกการคืนเงินแล้ว — รออนุมัติ" : state.reason}
        </p>
      )}
    </details>
  );
}
