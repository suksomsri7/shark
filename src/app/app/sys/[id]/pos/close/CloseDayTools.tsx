"use client";

import { useState } from "react";
import { exportDaySalesCsvAction } from "@/lib/actions/pos";
import { formatBaht } from "@/lib/ui/money";

// เครื่องมือฝั่ง client ของหน้าปิดวัน: กระทบยอดเงินสด (นับจริง − ควรมี) + ดาวน์โหลด CSV
// read-only helper — ไม่บันทึกอะไร (ปิดรอบจริงเป็น follow-up)
export function CloseDayTools({
  systemId,
  businessDate,
  cashInDrawerSatang,
}: {
  systemId: string;
  businessDate: string;
  cashInDrawerSatang: number;
}) {
  const [counted, setCounted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const countedSatang = counted.trim() === "" ? null : Math.round(Number(counted) * 100);
  const validCount = countedSatang !== null && Number.isFinite(countedSatang);
  const diffSatang = validCount ? countedSatang - cashInDrawerSatang : null;

  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      const csv = await exportDaySalesCsvAction(systemId, businessDate);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ปิดวัน-${businessDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* กระทบยอดเงินสด */}
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--color-muted)]">เงินสดที่ควรมีในลิ้นชัก</span>
          <span className="tabular-nums font-medium">{formatBaht(cashInDrawerSatang, { decimals: true })}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">เงินสดนับจริง (บาท)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="เช่น 1500.00"
            className="input min-h-[44px]"
          />
        </label>
        {diffSatang !== null && (
          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-[color:var(--color-muted)]">
              ส่วนต่าง (นับจริง − ควรมี)
            </span>
            <span className="tabular-nums font-semibold">
              {diffSatang > 0 ? "เกิน " : diffSatang < 0 ? "ขาด " : ""}
              {formatBaht(Math.abs(diffSatang), { decimals: true })}
            </span>
          </div>
        )}
        <p className="text-xs text-[color:var(--color-muted)]">
          เป็นตัวช่วยกระทบยอดเท่านั้น — ยังไม่บันทึกการปิดรอบ
        </p>
      </div>

      {/* ดาวน์โหลด CSV */}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-60"
      >
        {busy ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลด CSV"}
      </button>
      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
    </div>
  );
}

export default CloseDayTools;
