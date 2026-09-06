// ShortcutsPreferenceSwitch.tsx — สวิตช์ "ปุ่มลัดคีย์บอร์ด" ในหน้า /app/settings/preferences (K1.14)
// 🔴 optimistic: ติ๊กแล้วเห็นผลทันที · บันทึกไม่ผ่าน = คืนค่ากลับ + บอกเหตุผล (ไม่โทษผู้ใช้)
"use client";

import { useState, useTransition } from "react";
import { setKanbanShortcutsAction } from "@/lib/modules/kanban/actions";

export function ShortcutsPreferenceSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setOn(next);
    setError(null);
    startTransition(async () => {
      try {
        await setKanbanShortcutsAction({ enabled: next });
      } catch {
        setOn(!next);
        setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          data-testid="pref-kanban-shortcuts"
          checked={on}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>เปิดปุ่มลัดคีย์บอร์ดในบอร์ดงาน</span>
          <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            กด <kbd>?</kbd> ในหน้าบอร์ดเพื่อดูรายการทั้งหมด · ปุ่มลัดไม่ทำงานขณะพิมพ์อยู่ในช่องข้อความอยู่แล้ว ·
            ปิดตัวเลือกนี้ถ้าใช้โปรแกรมอ่านหน้าจอหรือถูกแป้นภาษาไทยแย่งโฟกัส
          </span>
        </span>
      </label>
      {error && <p style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</p>}
    </div>
  );
}

export default ShortcutsPreferenceSwitch;
