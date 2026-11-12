"use client";
// TRIPS T1.1 ▸ หน้าตาข้อผิดพลาดของจอทัวร์ (ใช้ร่วม: trips/error.tsx ของหน้า + TripsCatch ที่ครอบส่วนของ layout)
//   ข้อความไม่โทษผู้ใช้ · ไม่แสดงรายละเอียดภายใน (digest เท่านั้น) · ลองใหม่ = unstable_retry (โหลดส่วนนั้นใหม่จากเซิร์ฟเวอร์)
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

export default function TripsErrorView({ digest, retry }: { digest?: string; retry: () => void }) {
  const t = useTranslations("trips");
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section data-testid="trips-error" role="alert" className="flex min-w-0 flex-col items-start gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6">
      <h1 ref={ref} tabIndex={-1} className="text-lg font-bold text-[color:var(--color-ink)] outline-none">
        {t("error.title")}
      </h1>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("error.body")}</p>
      {digest ? <p className="text-sm text-[color:var(--color-muted)]">{t("error.ref", { digest })}</p> : null}
      <button type="button" onClick={retry} className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--color-ink)] px-4 text-sm font-bold text-[color:var(--color-surface)]">
        {t("error.retry")}
      </button>
    </section>
  );
}
