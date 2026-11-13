"use client";

// PrintToolbar.tsx — ACC T2.7 · แถบบนหน้าพิมพ์ (ไม่ขึ้นบนกระดาษ) + เปิดกล่องพิมพ์อัตโนมัติเมื่อมาจากปุ่ม "พิมพ์"/"ดาวน์โหลด PDF"
import { useEffect } from "react";

export function PrintToolbar({ label, auto }: { label: string; auto: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="mx-auto mb-3 flex max-w-2xl items-center justify-between gap-3 rounded-lg border bg-white px-4 py-2 text-sm print:hidden" data-testid="print-toolbar">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()} data-testid="print-toolbar-print">
        พิมพ์ / บันทึกเป็น PDF
      </button>
    </div>
  );
}
