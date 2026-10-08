"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cancelAdjustmentAction, decideAdjustmentAction } from "./payroll-actions";

// HF-HR-0 ▸ รอบ 5c (F5): ปุ่มของรายการเพิ่ม/หัก 1 แถวในหน้าเงินเดือน — server action คืนผลเป็นข้อมูล { ok, reason }
//   ⇒ เหตุผลที่ถูกปฏิเสธ (อนุมัติ/ปฏิเสธ/ลบรายการของตัวเอง · ไม่ทราบผู้ใช้ · ระบบขัดข้อง) แสดงในแถวนี้ (แบบเดียวกับ H3 หน้า “อนุมัติ”)
//   ปุ่มเหมือนเดิม: ยังรออนุมัติ = อนุมัติ/ไม่อนุมัติ · ตัดสินแล้ว = ลบ (แถวที่เข้ารอบจ่ายแล้ว ผู้เรียกไม่แสดงคอมโพเนนต์นี้) ◂
type Res = { ok: boolean; reason?: string } | null;

// H0.2 ▸ CR-H0.2-3: canDelete = แถวไม่มี crmCommissionId — รายการจาก CRM ไม่มีปุ่มลบ (ถอนที่ CRM) · ปุ่มอนุมัติ/ไม่อนุมัติของ PENDING คงเดิม ◂
export default function PayAdjustRowActions({ systemId, id, pending, canDelete = true }: { systemId: string; id: string; pending: boolean; canDelete?: boolean }) {
  const [state, run] = useActionState<Res, FormData>(
    (_prev, formData) => (formData.get("op") === "delete" ? cancelAdjustmentAction(formData) : decideAdjustmentAction(formData)),
    null,
  );
  const hidden = (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="id" value={id} />
    </>
  );
  return (
    <>
      {pending ? (
        <>
          <form action={run}>
            {hidden}
            <input type="hidden" name="status" value="APPROVED" />
            <SubmitButton variant="primary">อนุมัติ</SubmitButton>
          </form>
          <form action={run}>
            {hidden}
            <input type="hidden" name="status" value="REJECTED" />
            <SubmitButton variant="ghost">ไม่อนุมัติ</SubmitButton>
          </form>
        </>
      ) : canDelete ? (
        <form action={run}>
          {hidden}
          <input type="hidden" name="op" value="delete" />
          <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
        </form>
      ) : (
        <span className="text-xs text-[color:var(--color-muted)]">ถอนที่ CRM</span>
      )}
      {state && !state.ok && (
        <span role="alert" className="max-w-[14rem] text-xs text-[color:var(--color-danger)]">
          ไม่สำเร็จ: {state.reason}
        </span>
      )}
    </>
  );
}
