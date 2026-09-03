"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "./Modal";
import type { PinActionResult } from "@/lib/modules/account/dashboard-actions";

export type PinCandidate = { id: string; name: string; sub?: string; pinned: boolean };

// "+ เลือกบัญชี" → modal เลือกบัญชีปักหมุด (§4 ข้อ 9) — ใช้ร่วมกันทั้งบัญชีเงิน (AccountFinance)
// และผังบัญชี (AccountLedger) โดยรับ `action` เป็น server action ต่างกัน (dashboard-actions.ts)
// บันทึกครั้งเดียว (แทนที่ทั้งชุด pinned) ไม่ toggle ทีละตัว — ง่ายกว่าและ atomic
export function DashPinModal({
  triggerLabel,
  title,
  systemId,
  items,
  max,
  action,
  testId,
}: {
  triggerLabel: string;
  title: string;
  systemId: string;
  items: PinCandidate[];
  max: number;
  action: (systemId: string, ids: string[]) => Promise<PinActionResult>;
  testId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.filter((i) => i.pinned).map((i) => i.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openModal = () => {
    setSelected(new Set(items.filter((i) => i.pinned).map((i) => i.id)));
    setError(null);
    setOpen(true);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < max) next.add(id);
      return next;
    });
  };

  const save = () => {
    startTransition(async () => {
      const res = await action(systemId, [...selected]);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" className="btn btn-ghost text-sm" onClick={openModal} data-testid={`btn-${testId}`}>
        + {triggerLabel}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        testId={`modal-${testId}`}
        actions={
          <>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" onClick={save} disabled={pending} data-testid={`btn-${testId}-save`}>
              บันทึก
            </button>
          </>
        }
      >
        <p className="mb-2 text-xs text-[color:var(--color-muted)]">เลือกได้สูงสุด {max} รายการ — เลือกแล้ว {selected.size}/{max}</p>
        {error && <p className="mb-2 text-sm" style={{ color: "var(--color-danger)" }}>{error}</p>}
        <ul className="flex flex-col gap-1">
          {items.map((it) => {
            const checked = selected.has(it.id);
            const disabled = !checked && selected.size >= max;
            return (
              <li key={it.id}>
                <label
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer hover:bg-[color:var(--color-surface-2)]"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(it.id)}
                    data-testid={`${testId}-check-${it.id}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.name}</span>
                    {it.sub && <span className="block truncate text-xs text-[color:var(--color-muted)]">{it.sub}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

export default DashPinModal;
