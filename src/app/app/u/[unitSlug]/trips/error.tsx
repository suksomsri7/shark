"use client";
// TRIPS T1.1 ▸ ขอบเขตข้อผิดพลาดของจอทัวร์ (Next 16.2: error boundary ต้องเป็น Client Component · unstable_retry = โหลดส่วนนี้ใหม่จากเซิร์ฟเวอร์)
//   ข้อความไม่โทษผู้ใช้ · ไม่แสดงรายละเอียดภายใน (digest เท่านั้น)
import { useTranslations } from "next-intl";

export default function TripsError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const t = useTranslations("trips");
  return (
    <section data-testid="trips-error" role="alert" className="flex min-w-0 flex-col items-start gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6">
      <h1 className="text-lg font-bold text-[color:var(--color-ink)]">{t("error.title")}</h1>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("error.body")}</p>
      {error.digest ? <p className="text-sm text-[color:var(--color-muted)]">{t("error.ref", { digest: error.digest })}</p> : null}
      <button type="button" onClick={() => unstable_retry()} className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--color-ink)] px-4 text-sm font-bold text-[color:var(--color-surface)]">
        {t("error.retry")}
      </button>
    </section>
  );
}
