"use client";
// TRIPS T1.7a2 ▸ ปุ่มส่งออก CSV ของจอรายงาน (ใบสั่ง §5.2 · D2) — ไฟล์ข้อมูลล้วน คอลัมน์คงที่ตามระดับสิทธิ์ (บริการตัดสิน)
//   ส่งเฉพาะช่วง + สินค้าของตัวกรองปัจจุบัน (ฐานวันเดินทางเสมอ · ภาษาไฟล์เซิร์ฟเวอร์อ่านจากคุกกี้) · ระหว่างรอ ปุ่มปิด "กำลังเตรียมไฟล์…"
//   ไฟล์ถูกตัดที่เพดาน ⇒ ชื่อไฟล์ลงท้าย -partial + แจ้งบนจอว่ามีกี่รอบจากทั้งหมด · บรรทัด "ตัวเลขบริหาร" อยู่ข้างปุ่ม (ไฟล์ไม่มีบรรทัดข้อความ)
//   ไม่มี JavaScript ⇒ <noscript> บอกว่าการส่งออกต้องเปิด JavaScript (หนี้ §12)
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TripReportVM } from "@/lib/modules/trips";
import { exportTripReportCsvAction } from "@/lib/modules/trips/report-actions";
import { BTN } from "./ProductsScreenParts";
import { MGMT_LINE } from "./CostParts";

const KNOWN = new Set(["FORBIDDEN", "NOT_FOUND", "INVALID_INPUT", "BUSY", "RANGE_TOO_LARGE", "REPORT_TOO_LARGE"]);

export default function ReportExport({ vm }: { vm: TripReportVM }) {
  const t = useTranslations("trips");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState<{ shown: number; total: number } | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPartial(null);
    try {
      const r = await exportTripReportCsvAction(vm.unit.slug, { from: vm.filter.from, to: vm.filter.to, productId: vm.filter.productId });
      if (!r.ok) {
        const minutes = "minutes" in r && typeof r.minutes === "number" ? r.minutes : 60;
        setError(r.code === "RATE_LIMITED" ? t("errors.RATE_LIMITED", { min: minutes }) : KNOWN.has(r.code) ? t(`errors.${r.code}`) : t("report.export.error"));
        return;
      }
      const blob = new Blob([r.value.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.value.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (r.value.truncated) setPartial({ shown: r.value.rows, total: r.value.total });
    } catch {
      setError(t("report.export.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" data-testid="trips-rp-export" className={BTN} disabled={busy} aria-busy={busy || undefined} onClick={() => void run()}>
          {busy ? t("report.export.busy") : t("report.export.button")}
        </button>
        <span data-testid="trips-rp-export-mgmt" className={MGMT_LINE}>
          {t("report.mgmt")}
        </span>
      </div>
      <noscript>
        <p data-testid="trips-rp-export-nojs" className={MGMT_LINE}>
          {t("report.export.noJs")}
        </p>
      </noscript>
      {partial ? (
        <p data-testid="trips-rp-export-partial" role="status" className="text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
          {t("report.export.partial", { shown: partial.shown, total: partial.total })}
        </p>
      ) : null}
      {error ? (
        <p data-testid="trips-rp-export-error" role="alert" className="text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
