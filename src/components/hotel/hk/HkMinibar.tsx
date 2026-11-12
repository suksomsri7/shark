"use client";
// SVC H.6 ▸ มินิบาร์ที่ใช้ → ลงบิลห้องแขก (ภาพ 13 ข · ค่าตั้ง #75) — ราคา/ชื่อจากค่าตั้ง (จอส่งแค่ key+จำนวน) · −/+ ปุ่มใหญ่ · 0–20 ต่อรายการ
//   แขกพักอยู่ ⇒ ลงบิลห้อง (folio) ตอนกด "เสร็จ" · แขกออกไปแล้ว ⇒ ระบบบันทึกค้างเก็บ ให้หน้าเคาน์เตอร์ตัดสินใจ
import { baht, type HkMinibarItem } from "./hk-shared";

export type HkQty = { [key: string]: number };
export type HkMinibarProps = { items: HkMinibarItem[]; qty: HkQty; onChange: (q: HkQty) => void; inHouse: boolean; disabled?: boolean };
const MAX_QTY = 20;

export default function HkMinibar({ items, qty, onChange, inHouse, disabled }: HkMinibarProps) {
  if (!items.length) return null;
  const set = (key: string, n: number) => onChange({ ...qty, [key]: Math.max(0, Math.min(MAX_QTY, n)) });
  return (
    <section data-hk-minibar={items.length} className="flex flex-col rounded-[14px] border border-[#e4e4e7] bg-white px-4 pb-3 pt-3">
      <h2 className="pb-1 text-[15px] font-bold">มินิบาร์ที่ใช้ → ลงบิลห้องแขก</h2>
      <ul className="flex flex-col">
        {items.map((it, i) => {
          const n = qty[it.key] ?? 0;
          return (
            <li key={it.key} data-minibar-item={it.key} className={`flex min-h-12 items-center gap-2 py-2 ${i ? "border-t border-[#f4f4f5]" : ""}`}>
              <span className="min-w-0 flex-1 text-[15px]">
                {it.name} {baht(it.priceSatang)}
              </span>
              <button type="button" aria-label={`ลด ${it.name}`} disabled={disabled || n <= 0} onClick={() => set(it.key, n - 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#e4e4e7] text-lg disabled:opacity-40">
                −
              </button>
              <span className="w-7 text-center text-[15px] font-semibold" aria-live="polite">
                {n}
              </span>
              <button type="button" aria-label={`เพิ่ม ${it.name}`} disabled={disabled || n >= MAX_QTY} onClick={() => set(it.key, n + 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#e4e4e7] text-lg disabled:opacity-40">
                +
              </button>
            </li>
          );
        })}
      </ul>
      <p className="pt-2 text-[13px] text-[#71717a]">
        {inHouse ? "ลงบิลห้องของแขกที่พักอยู่ตอนกด «เสร็จ» (ราคาตามที่โรงแรมตั้ง)" : "แขกออกไปแล้ว → ระบบถามหน้าเคาน์เตอร์ว่าเรียกเก็บหรือยกให้"}
      </p>
    </section>
  );
}
