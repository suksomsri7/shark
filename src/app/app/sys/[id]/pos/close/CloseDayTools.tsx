"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { exportDaySalesCsvAction } from "@/lib/actions/pos";
import { formatBaht } from "@/lib/ui/money";

// เครื่องมือฝั่ง client ของหน้าปิดวัน: กระทบยอดเงินสด (นับจริง − ควรมี) + ดาวน์โหลด CSV
// read-only helper — ไม่บันทึกอะไร (ปิดรอบจริงเป็น follow-up) · POS P1.18U ▸ มติ 9: ข้อความผ่าน t (pos.report.closeDay.tools.*) ◂
export function CloseDayTools({
  systemId,
  businessDate,
  cashInDrawerSatang,
}: {
  systemId: string;
  businessDate: string;
  cashInDrawerSatang: number;
}) {
  const t = useTranslations("pos.report.closeDay.tools");
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
      a.download = t("csvFile", { date: businessDate });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t("downloadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* กระทบยอดเงินสด */}
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--color-muted)]">{t("expectedCash")}</span>
          <span className="tabular-nums font-medium">{formatBaht(cashInDrawerSatang, { decimals: true })}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("countedCash")}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder={t("countedPlaceholder")}
            className="input min-h-[44px]"
          />
        </label>
        {diffSatang !== null && (
          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-[color:var(--color-muted)]">
              {t("diff")}
            </span>
            <span className="tabular-nums font-semibold">
              {diffSatang > 0 ? `${t("over")} ` : diffSatang < 0 ? `${t("short")} ` : ""}
              {formatBaht(Math.abs(diffSatang), { decimals: true })}
            </span>
          </div>
        )}
        <p className="text-xs text-[color:var(--color-muted)]">
          {t("note")}
        </p>
      </div>

      {/* ดาวน์โหลด CSV */}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-60"
      >
        {busy ? t("preparing") : t("downloadCsv")}
      </button>
      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
    </div>
  );
}

export default CloseDayTools;
