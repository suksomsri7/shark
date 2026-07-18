"use client";

import { useActionState, useEffect, useState } from "react";
import { bulkDecideAction, type BulkDecideState } from "@/lib/modules/approval/actions";

// เลือกหลายคำขอ (checkbox) แล้วอนุมัติ/ปฏิเสธพร้อมกัน — สรุปผลแสดง inline
// อยู่ในหน้า /app/approvals แทนปุ่มรายใบเดิม (เลือก 1 ใบ = ทำรายเดียวได้)
type Item = { id: string; label: string; meta: string };

export default function BulkApprovals({ items }: { items: Item[] }) {
  const [state, formAction, pending] = useActionState<BulkDecideState, FormData>(
    bulkDecideAction,
    { status: "idle" },
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "APPROVED" | "REJECTED">(null);

  // ทำเสร็จ → ปิดกล่องยืนยัน + ล้างที่เลือก (รายการที่ผ่านจะหายไปหลัง revalidate)
  useEffect(() => {
    if (state.status === "done") {
      setConfirm(null);
      setSelected(new Set());
    }
  }, [state]);

  const allChecked = items.length > 0 && selected.size === items.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));
  const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? id;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-5 w-5" />
        เลือกทั้งหมด ({selected.size}/{items.length})
      </label>

      <div className="flex flex-col gap-2">
        {items.map((i) => (
          <label
            key={i.id}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              name="requestIds"
              value={i.id}
              checked={selected.has(i.id)}
              onChange={() => toggle(i.id)}
              className="h-5 w-5 shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{i.label}</span>
              <span className="block truncate text-xs text-[color:var(--color-muted)]">{i.meta}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={() => setConfirm("APPROVED")}
          className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
        >
          อนุมัติที่เลือก ({selected.size})
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={() => setConfirm("REJECTED")}
          className="btn min-h-[44px] text-sm text-white disabled:opacity-50"
          style={{ background: "var(--color-danger)" }}
        >
          ปฏิเสธที่เลือก ({selected.size})
        </button>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {confirm === "APPROVED" ? "อนุมัติคำขอที่เลือก?" : "ปฏิเสธคำขอที่เลือก?"}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-muted)]">
              เลือกไว้ {selected.size} รายการ
              {confirm === "REJECTED" ? " — จะถูกปฏิเสธทันที ไม่ไปขั้นถัดไป" : ""}
            </p>
            <label className="mt-4 flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              {confirm === "REJECTED" ? "เหตุผลที่ไม่อนุมัติ" : "หมายเหตุ (ถ้ามี)"}
              <input
                name="note"
                required={confirm === "REJECTED"}
                className="input"
                placeholder={confirm === "REJECTED" ? "เช่น เกินงบที่ตั้งไว้" : ""}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost min-h-[44px] text-sm"
                onClick={() => setConfirm(null)}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                name="decision"
                value={confirm}
                disabled={pending}
                className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
                style={confirm === "REJECTED" ? { background: "var(--color-danger)" } : undefined}
              >
                {pending ? "กำลังทำรายการ…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "done" && (
        <div className="rounded-lg border px-3 py-2 text-sm">
          <div className="font-medium">
            สำเร็จ {state.done} รายการ
            {state.failed.length > 0 ? ` · ล้มเหลว ${state.failed.length} รายการ` : ""}
          </div>
          {state.failed.map((f) => (
            <div key={f.id} className="text-xs text-[color:var(--color-danger)]">
              • {labelOf(f.id)}: {f.reason}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
