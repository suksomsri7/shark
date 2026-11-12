"use client";
// SVC H.6 ▸ เช็กลิสต์ทำห้อง (ภาพ 13 ข · ค่าตั้ง #74 ต่อประเภทห้อง) — ติ๊กเก็บชั่วคราวฝั่งเครื่อง (localStorage ต่อห้อง/วัน) · ส่งครบตอนกด "เสร็จ"
import { useEffect, useState } from "react";

export type HkChecks = { [item: string]: boolean };
export type HkChecklistProps = { items: string[]; storeKey: string; value: HkChecks; onChange: (v: HkChecks) => void; disabled?: boolean };

export function loadChecks(storeKey: string): HkChecks {
  if (typeof window === "undefined") return {};
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(storeKey) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as HkChecks) : {};
  } catch {
    return {};
  }
}

export default function HkChecklist({ items, storeKey, value, onChange, disabled }: HkChecklistProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storeKey, JSON.stringify(value));
    } catch {
      /* ที่เก็บเต็ม/ปิด — ข้าม */
    }
  }, [ready, storeKey, value]);

  return (
    <section data-hk-checklist={items.length} className="flex flex-col rounded-[14px] border border-[#e4e4e7] bg-white px-4 pb-1 pt-3">
      <h2 className="pb-1 text-[15px] font-bold">เช็กลิสต์ (ตั้งได้ต่อประเภทห้อง)</h2>
      {items.length === 0 ? <p className="py-3 text-sm text-[#71717a]">ยังไม่ได้ตั้งเช็กลิสต์ของประเภทห้องนี้</p> : null}
      <ul className="flex flex-col">
        {items.map((it, i) => {
          const on = value[it] === true;
          return (
            <li key={`${i}-${it}`} className={i ? "border-t border-[#f4f4f5]" : ""}>
              <label className="flex min-h-12 items-center gap-3 py-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...value, [it]: e.currentTarget.checked })}
                  className="h-6 w-6 shrink-0 accent-[#0a0a0a]"
                />
                <span className={on ? "text-[#18181b]" : "text-[#3f3f46]"}>{it}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
