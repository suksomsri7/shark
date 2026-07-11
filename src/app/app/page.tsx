import { getTranslations } from "next-intl/server";

// Overview "ทุกกิจการ" (placeholder Stage A) — การ์ด KPI ต่อ unit จะมาตอน getUnitKpi พร้อม
export default async function OverviewPage() {
  const t = await getTranslations("nav");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("allBusinesses")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <div className="text-sm text-[color:var(--color-muted)]">ยังไม่มีกิจการ</div>
          <div className="mt-2 text-lg font-medium">เริ่มสร้างกิจการแรกของคุณ</div>
        </div>
      </div>
    </div>
  );
}
