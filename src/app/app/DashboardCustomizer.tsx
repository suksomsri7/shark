"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBaht } from "@/lib/ui/money";
import { saveDashboardLayoutAction } from "@/lib/dashboard/actions";

// โหมด "ปรับแต่ง" หน้าแรก — เลือก/เรียงการ์ด แล้วบันทึก (WO-0056)
// - ค่าเงิน (unit "baht") เก็บเป็นสตางค์ → แสดงบาท (หาร 100)
// - inline error ไม่ใช้ alert (UI_STANDARD) · ไทยล้วน minimal

export type WidgetMeta = { key: string; label: string; unit?: string };

// แสดงค่า widget ตามชนิด (เงิน = บาท, อื่น ๆ = จำนวนเต็ม)
function displayValue(meta: WidgetMeta | undefined, value: number): string {
  if (meta?.unit === "baht") return formatBaht(value);
  return value.toLocaleString("th-TH");
}

export function DashboardCustomizer({
  widgets,
  layout,
  values,
}: {
  widgets: WidgetMeta[];
  layout: string[];
  values: Record<string, number>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(layout);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const metaByKey = useMemo(() => {
    const m: Record<string, WidgetMeta> = {};
    for (const w of widgets) m[w.key] = w;
    return m;
  }, [widgets]);

  // การ์ดที่ยังไม่ได้เลือก (ไว้ให้กดเพิ่ม)
  const available = widgets.filter((w) => !selected.includes(w.key));

  function move(idx: number, dir: -1 | 1) {
    const next = [...selected];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setSelected(next);
  }
  function remove(key: string) {
    setSelected((s) => s.filter((k) => k !== key));
  }
  function add(key: string) {
    setSelected((s) => (s.includes(key) ? s : [...s, key]));
  }

  function onSave() {
    setError(null);
    if (selected.length === 0) {
      setError("กรุณาเลือกการ์ดอย่างน้อย 1 รายการ");
      return;
    }
    startTransition(async () => {
      const res = await saveDashboardLayoutAction(selected);
      if (res.status === "error") {
        setError(res.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onCancel() {
    setSelected(layout);
    setError(null);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">ภาพรวมวันนี้</h2>
        {editing ? (
          <div className="flex items-center gap-2">
            <button type="button" className="btn-sm" onClick={onCancel} disabled={pending}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              onClick={onSave}
              disabled={pending}
            >
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        ) : (
          <button type="button" className="text-xs underline" onClick={() => setEditing(true)}>
            ปรับแต่ง
          </button>
        )}
      </div>

      {error && <div className="text-sm text-[color:var(--color-danger)]">{error}</div>}

      {editing ? (
        <div className="flex flex-col gap-4">
          {/* การ์ดที่เลือก — เรียงลำดับได้ */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[color:var(--color-muted)]">
              การ์ดที่แสดง ({selected.length})
            </div>
            {selected.length === 0 ? (
              <div className="card py-4 text-center text-sm text-[color:var(--color-muted)]">
                ยังไม่ได้เลือกการ์ด — เพิ่มจากด้านล่าง
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {selected.map((key, idx) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-md border bg-[color:var(--color-surface)] px-3 py-2"
                  >
                    <span className="flex-1 text-sm">{metaByKey[key]?.label ?? key}</span>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label="เลื่อนขึ้น"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => move(idx, 1)}
                      disabled={idx === selected.length - 1}
                      aria-label="เลื่อนลง"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => remove(key)}
                      aria-label="เอาออก"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* การ์ดที่เพิ่มได้ */}
          {available.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-[color:var(--color-muted)]">เพิ่มการ์ด</div>
              <div className="flex flex-wrap gap-2">
                {available.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    className="btn-sm"
                    onClick={() => add(w.key)}
                  >
                    + {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {layout.length === 0 ? (
            <div className="card col-span-full py-8 text-center text-sm text-[color:var(--color-muted)]">
              ยังไม่ได้เลือกการ์ด — กด &quot;ปรับแต่ง&quot;
            </div>
          ) : (
            layout.map((key) => (
              <div key={key} className="card p-3">
                <div className="text-xs text-[color:var(--color-muted)]">
                  {metaByKey[key]?.label ?? key}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {displayValue(metaByKey[key], values[key] ?? 0)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default DashboardCustomizer;
