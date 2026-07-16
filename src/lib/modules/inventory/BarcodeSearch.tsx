"use client";

import { useActionState, useEffect, useRef } from "react";
import { findItemByBarcodeAction, type BarcodeSearchResult } from "./actions";

// ช่องค้นหา/สแกนบาร์โค้ด (WO-0038) — พิมพ์หรือยิงเครื่องสแกนแล้ว Enter
export default function BarcodeSearch({ systemId }: { systemId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<BarcodeSearchResult | null, FormData>(
    async (prev, formData) => findItemByBarcodeAction(systemId, prev, formData),
    null,
  );

  // เคลียร์ช่องหลังค้นเจอ/ไม่เจอ เพื่อยิงบาร์โค้ดถัดไปได้ทันที
  useEffect(() => {
    if (state && inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex gap-2">
        <input
          ref={inputRef}
          name="barcode"
          required
          autoComplete="off"
          inputMode="numeric"
          placeholder="ยิง/พิมพ์บาร์โค้ด แล้วกดค้นหา"
          className="input flex-1"
        />
        <button type="submit" disabled={pending} className="btn btn-primary text-sm disabled:opacity-50">
          {pending ? "…" : "ค้นหา"}
        </button>
      </form>

      {state &&
        (state.ok ? (
          <div className="rounded-lg border px-3 py-2 text-sm">
            <div className="font-medium">{state.item.name}</div>
            <div className="text-xs text-[color:var(--color-muted)]">
              รหัส {state.item.sku} · คงเหลือ {state.item.onHand.toLocaleString("th-TH")} {state.item.unitLabel}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
            ไม่พบสินค้าที่มีบาร์โค้ด {state.barcode}
          </div>
        ))}
    </div>
  );
}
