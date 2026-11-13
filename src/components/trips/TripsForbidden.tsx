import { getTranslations } from "next-intl/server";

// TRIPS T1.1 ▸ การ์ดปฏิเสธของโมดูลทัวร์ (ไม่มีสิทธิ์ trips เลย / ไม่มีสิทธิ์หน้านี้) — ข้อความไม่โทษผู้ใช้ + ทางไปต่อ
export default async function TripsForbidden() {
  const t = await getTranslations("trips");
  return (
    <section data-testid="trips-forbidden" role="status" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6">
      <h1 className="text-lg font-bold text-[color:var(--color-ink)]">{t("forbidden.title")}</h1>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("forbidden.body")}</p>
    </section>
  );
}
