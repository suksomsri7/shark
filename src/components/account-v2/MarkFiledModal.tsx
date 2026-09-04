"use client";

// MarkFiledModal — "ทำเครื่องหมายนำส่งแล้ว" (WO 5.4 · DESIGN-SPEC-V2 §10.5 "(งวด)" · g11 bulk bar)
// เปิดผ่าน query `?markFiled=1&ids=…` (pattern เดียวกับ FinanceModal `?edit=`) — server หน้า wht เตรียม
// `summary` มาให้แล้ว (ตรวจว่า certs ที่เลือกอยู่แบบ/งวดเดียวกันหรือยัง) ตัวนี้แค่ยืนยัน+เรียก server action
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { formatBaht } from "@/lib/ui/money";
import { markFiledAction } from "@/app/app/sys/[id]/account/wht/actions";

export type MarkFiledSummary =
  | {
      ok: true;
      form: 3 | 53;
      periodKey: string;
      periodLabel: string;
      certCount: number;
      totalBaseSatang: number;
      totalTaxSatang: number;
      alreadyFiled: boolean;
    }
  | { ok: false; reason: string };

export function MarkFiledModal({
  systemId,
  summary,
  closeHref,
}: {
  systemId: string;
  summary: MarkFiledSummary;
  closeHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const close = () => router.push(closeHref);

  const confirm = () => {
    if (!summary.ok) return;
    start(async () => {
      const res = await markFiledAction(systemId, { form: summary.form, periodKey: summary.periodKey });
      if (res.ok) router.push(closeHref);
    });
  };

  return (
    <Modal open onClose={close} size="sm" sheetOnMobile testId="wht-mark-filed-modal" title="ทำเครื่องหมายนำส่งแล้ว">
      {summary.ok ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-muted)]">แบบ</span>
              <span className="font-medium">ภ.ง.ด.{summary.form}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-muted)]">งวด</span>
              <span className="font-medium">{summary.periodLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-muted)]">จำนวนใบ</span>
              <span className="font-medium" data-testid="mark-filed-count">{summary.certCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-muted)]">ฐานเงินได้รวม</span>
              <span className="font-medium">{formatBaht(summary.totalBaseSatang, { decimals: true })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[color:var(--color-muted)]">ภาษีที่หักรวม</span>
              <span className="font-medium" data-testid="mark-filed-tax">{formatBaht(summary.totalTaxSatang, { decimals: true })}</span>
            </div>
          </div>
          {summary.alreadyFiled && (
            <p className="text-xs text-[color:var(--color-muted)]" data-testid="mark-filed-already">
              เคยทำเครื่องหมายนำส่งงวดนี้ไว้แล้ว — ยืนยันซ้ำจะปรับผลรวมให้ตรงข้อมูลล่าสุด (ไม่นับซ้ำ)
            </p>
          )}
          <p className="text-xs text-[color:var(--color-muted)]">
            ระบบจะทำเครื่องหมาย "ยื่นแล้ว" ให้ 50 ทวิ ทุกใบของงวดนี้ (ไม่ใช่แค่ที่เลือกไว้) — เพื่อให้ตรงกับการยื่นจริงต่อกรมสรรพากร
          </p>
        </div>
      ) : (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="mark-filed-err">
          {summary.reason}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={close}>
          ยกเลิก
        </button>
        {summary.ok && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={confirm} data-testid="mark-filed-confirm">
            {pending ? "กำลังบันทึก…" : "✓ ยืนยันทำเครื่องหมายนำส่งแล้ว"}
          </button>
        )}
      </div>
    </Modal>
  );
}

export default MarkFiledModal;
