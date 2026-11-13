"use client";

// DepositSettleDialog — ACC T2.4 · กล่องยืนยัน "คืนมัดจำ" / "ริบมัดจำ" ของใบรับเงินมัดจำ
//   เหมือน ConfirmDialog (แผ่นล่างบนมือถือ / กลางจอเดสก์ท็อป) + วันที่ (ปริยายวันนี้) + คำเตือนทะเบียนกลาง (ใบลดหนี้ · ริบมัดจำ [U])
//   ค่าทั้งหมดมาจาก server (depositSettlePreview) — ที่นี่แค่แสดงและส่งฟอร์ม
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LegalWarnings } from "./LegalWarnings";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";

function Submit({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-sm disabled:opacity-50" style={danger ? { background: "var(--color-danger)" } : undefined}>
      {pending ? "กำลังทำรายการ…" : label}
    </button>
  );
}

export function DepositSettleDialog({
  action,
  fields,
  triggerLabel,
  triggerClassName = "btn btn-ghost text-sm",
  title,
  detail,
  confirmLabel,
  reasonLabel,
  todayIso,
  warnings,
  danger,
  testId,
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  detail: string;
  confirmLabel: string;
  reasonLabel: string;
  /** วันนี้ (YYYY-MM-DD ตามปฏิทินไทย) จาก server */
  todayIso: string;
  warnings: LegalWarning[];
  danger?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)} data-testid={`${testId}-trigger`}>
        {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid={`${testId}-sheet`}
          >
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-[color:var(--color-muted)]">{detail}</p>
            <form action={action} className="mt-4 flex flex-col gap-3">
              {Object.entries(fields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <LegalWarnings warnings={warnings} ackName="ack" testId={`${testId}-warnings`} compact />
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                วันที่
                <input type="date" name="date" defaultValue={todayIso} required className="rounded-lg border px-3 py-2 text-sm" data-testid={`${testId}-date`} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                {reasonLabel}
                <input name="reason" required minLength={5} className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]" data-testid={`${testId}-reason`} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
                  ยกเลิก
                </button>
                <Submit label={confirmLabel} danger={danger} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
