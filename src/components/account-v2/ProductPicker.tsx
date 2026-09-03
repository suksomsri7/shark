"use client";

import { useEffect, useRef, useState } from "react";
import { MoneyText } from "@/components/ui/MoneyText";

export type ProductSearchResult = {
  id: string;
  name: string;
  sub?: string;
  meta?: { priceSatang?: number; unit?: string };
};

// lookup สินค้า/บริการ (DESIGN-SPEC-V2 §5.2 C) — เหมือน ContactPicker แต่โชว์ราคา/หน่วยแทน
export function ProductPicker({
  name,
  defaultId,
  defaultLabel,
  placeholder = "พิมพ์ค้นหาสินค้า/บริการ หรือพิมพ์อิสระ",
  search,
  onCreate,
  onSelect,
  testId,
  defaultOpen = false,
  initialResults,
}: {
  name?: string;
  defaultId?: string;
  defaultLabel?: string;
  placeholder?: string;
  search: (q: string) => Promise<ProductSearchResult[]>;
  onCreate?: (q: string) => void;
  onSelect?: (r: ProductSearchResult) => void;
  testId?: string;
  /** เปิดผลลัพธ์ไว้ตั้งแต่แรก — เฉพาะหน้า gallery สำหรับถ่ายภาพ QC */
  defaultOpen?: boolean;
  /** ผลลัพธ์เริ่มต้นให้แสดงทันทีโดยไม่ต้องเรียก search() — เฉพาะหน้า gallery */
  initialResults?: ProductSearchResult[];
}) {
  const [query, setQuery] = useState(defaultLabel ?? "");
  const [selectedId, setSelectedId] = useState(defaultId ?? "");
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProductSearchResult[]>(initialResults ?? []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const runSearch = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await search(q));
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  return (
    <div className="relative" ref={boxRef} data-testid={testId}>
      <input
        type="text"
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          setOpen(true);
          runSearch(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          runSearch(query);
        }}
        data-testid={testId ? `${testId}-input` : undefined}
      />
      {name && <input type="hidden" name={name} value={selectedId} />}

      {open && (
        <div
          className="absolute z-20 mt-1 w-full min-w-[280px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]"
          role="listbox"
        >
          {loading && <div className="px-3 py-2 text-sm text-[color:var(--color-muted)]">กำลังค้นหา…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-[color:var(--color-muted)]">ไม่พบสินค้า/บริการ</div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={r.id === selectedId}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                onClick={() => {
                  setSelectedId(r.id);
                  setQuery(r.name);
                  setOpen(false);
                  onSelect?.(r);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.name}</span>
                  {r.sub && <span className="block truncate text-xs text-[color:var(--color-muted)]">{r.sub}</span>}
                </span>
                {r.meta && (
                  <span className="shrink-0 text-xs text-[color:var(--color-muted)]">
                    {typeof r.meta.priceSatang === "number" && <MoneyText satang={r.meta.priceSatang} />}
                    {r.meta.unit && ` / ${r.meta.unit}`}
                  </span>
                )}
              </button>
            ))}
          {onCreate && (
            <button
              type="button"
              className="w-full border-t px-3 py-2 text-left text-sm text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)]"
              onClick={() => {
                setOpen(false);
                onCreate(query);
              }}
              data-testid={testId ? `${testId}-create` : undefined}
            >
              + สร้างสินค้าใหม่{query ? ` "${query}"` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductPicker;
