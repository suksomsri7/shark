"use client";
// TRIPS T1.7a2 ▸ กล่องแจ้งเมื่อทิ้งตัวกรองหมดแล้วช่วงปริยายยังเกินเพดาน (มติ J1 · ไม่เป็นหน้า "ไม่พบ")
//   ข้อความ errors.REPORT_TOO_LARGE (role="alert") · ลิงก์ช่วงสั้น 7 วันที่ผ่านมา (ช่วงจากหน้า) · ลิงก์กลับปฏิทินรอบ
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BTN } from "./ProductsScreenParts";

export default function ReportTooLarge({ unitSlug, from, to }: { unitSlug: string; from: string; to: string }) {
  const t = useTranslations("trips");
  return (
    <div data-testid="trips-rp" className="flex min-w-0 flex-col gap-4">
      <h1 data-testid="trips-rp-title" className="min-w-0 text-xl font-bold text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
        {t("report.title")}
      </h1>
      <div data-testid="trips-rp-error" role="alert" className="flex min-w-0 flex-col gap-3 rounded-lg border border-[color:var(--color-danger)] px-3 py-3 text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
        <p>{t("errors.REPORT_TOO_LARGE")}</p>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Link href={`/app/u/${unitSlug}/trips/reports?from=${from}&to=${to}`} className={BTN}>
            {t("report.preset.last7")}
          </Link>
          <Link data-testid="trips-rp-back" href={`/app/u/${unitSlug}/trips/departures`} className={BTN}>
            {t("report.back")}
          </Link>
        </div>
      </div>
    </div>
  );
}
