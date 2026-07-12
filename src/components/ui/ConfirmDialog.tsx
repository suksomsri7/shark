"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

// กล่องยืนยันก่อนทำ action ที่ทำลาย/แตะเงิน (void, ปิดงวด, เช็คเอาท์, ลบ)
// ใช้แทนปุ่มเดิมใน server-action form — bottom-sheet บนมือถือ / dialog กลางจอ desktop
type Props = {
  triggerLabel: React.ReactNode; // เนื้อหาปุ่มเดิม
  triggerClassName?: string; // สไตล์ปุ่มเดิม
  title: string; // "ยกเลิกเอกสารนี้?"
  detail?: string; // ผลที่ตามมา
  confirmLabel: string; // "ยืนยันยกเลิก"
  danger?: boolean;
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>; // hidden fields
  reasonField?: { name: string; label: string; required?: boolean };
};

function ConfirmButton({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary text-sm disabled:opacity-50"
      style={danger ? { background: "var(--color-danger)" } : undefined}
    >
      {pending ? "กำลังทำรายการ…" : label}
    </button>
  );
}

export default function ConfirmDialog({
  triggerLabel,
  triggerClassName = "btn btn-ghost text-sm",
  title,
  detail,
  confirmLabel,
  danger,
  action,
  fields,
  reasonField,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{title}</h2>
            {detail && <p className="mt-1 text-sm text-[color:var(--color-muted)]">{detail}</p>}
            <form action={action} className="mt-4 flex flex-col gap-3">
              {fields &&
                Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              {reasonField && (
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  {reasonField.label}
                  <input
                    name={reasonField.name}
                    required={reasonField.required}
                    className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
                  />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
                  ยกเลิก
                </button>
                <ConfirmButton label={confirmLabel} danger={danger} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
