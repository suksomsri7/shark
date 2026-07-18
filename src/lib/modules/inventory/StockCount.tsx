"use client";

import { useActionState, useEffect, useState } from "react";
import { bulkCountAction, type BulkCountState } from "./actions";

// โหมดนับสต็อก — กรอกจำนวนที่นับได้จริงต่อแถว แล้วบันทึกทีเดียว (bulkCount) เฉพาะแถวที่กรอก
// ฝังในหน้าคลัง · ตั้ง onHand = จำนวนนับ (movement ADJUST) · สรุปผลแสดง inline
type Item = { id: string; name: string; sku: string; onHand: number; unitLabel: string };

export default function StockCount({ systemId, items }: { systemId: string; items: Item[] }) {
  const [state, formAction, pending] = useActionState<BulkCountState, FormData>(
    async (prev, formData) => bulkCountAction(systemId, prev, formData),
    { status: "idle" },
  );
  // ทำเสร็จ → รีเซ็ตช่องกรอก (remount ด้วย key) เพื่อเริ่มนับรอบใหม่บนยอดล่าสุด
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.status === "done") setFormKey((k) => k + 1);
  }, [state]);

  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div key={formKey} className="flex flex-col gap-2">
        {items.map((i) => (
          <div key={i.id} className="flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <input type="hidden" name="countItemId" value={i.id} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{i.name}</div>
              <div className="truncate text-xs text-[color:var(--color-muted)]">
                รหัส {i.sku} · ระบบมี {i.onHand.toLocaleString("th-TH")} {i.unitLabel}
              </div>
            </div>
            <input
              name="countQty"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="นับได้"
              aria-label={`จำนวนที่นับได้ ${i.name}`}
              className="input w-24 shrink-0 text-right"
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary min-h-[44px] self-start text-sm disabled:opacity-50"
      >
        {pending ? "กำลังบันทึกการนับ…" : "บันทึกการนับ"}
      </button>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "done" && (
        <div className="rounded-lg border px-3 py-2 text-sm">
          <div className="font-medium">
            บันทึกการนับ {state.done} รายการ
            {state.failed.length > 0 ? ` · ล้มเหลว ${state.failed.length} รายการ` : ""}
          </div>
          {state.failed.map((f) => (
            <div key={f.itemId} className="text-xs text-[color:var(--color-danger)]">
              • {nameOf(f.itemId)}: {f.reason}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
