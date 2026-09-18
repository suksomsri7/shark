"use client";

// ช่องเลือกที่ค้นฝั่งเซิร์ฟเวอร์ของหน้าผู้ติดต่อ (บทเรียน C1.3 SF11) — พิมพ์แล้วรอ 250 ms ค่อยถาม · ไม่โหลดทั้งระบบมาตัดที่เครื่อง
// testid = `contact-pick-<kind>-q` / `contact-pick-<kind>-select` (แพตเทิร์นในทะเบียนปุ่ม)

import { useEffect, useRef, useState } from "react";

type Item = { id: string; name: string };
type Result = { ok: true; items: Item[] } | { ok: false; error: string };

export function ContactPicker({
  kind,
  label,
  placeholder,
  emptyLabel,
  value,
  onChange,
  search,
}: {
  kind: "company" | "merge" | "convert-company" | "edit-company";
  label: string;
  placeholder: string;
  emptyLabel: string;
  value: string;
  onChange: (id: string) => void;
  search: (q: string) => Promise<Result>;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const searchRef = useRef(search);
  searchRef.current = search;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchRef.current(q);
      if (my !== seq.current) return; // ผลของคำค้นเก่า — ทิ้ง
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(r.items);
      // ค่าที่เลือกไว้หลุดจากผลค้นใหม่ = ล้าง (ไม่ให้ค่าที่มองไม่เห็นถูกส่งไปโดยไม่รู้ตัว)
      if (valueRef.current && !r.items.some((it) => it.id === valueRef.current)) onChangeRef.current("");
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>{label}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input text-sm" placeholder={placeholder} data-testid={`contact-pick-${kind}-q`} />
      </label>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input text-sm" data-testid={`contact-pick-${kind}-select`}>
        <option value="">{emptyLabel}</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.name}
          </option>
        ))}
      </select>
      {loading ? (
        <span className="text-xs text-[color:var(--color-muted)]">กำลังค้นหา…</span>
      ) : !error && q && items.length === 0 ? (
        <span className="text-xs text-[color:var(--color-muted)]">ไม่พบรายการที่ตรงกับคำค้น — ลองพิมพ์คำอื่น</span>
      ) : null}
      {error && <span className="text-xs text-[color:var(--color-danger)]">{error}</span>}
    </div>
  );
}
