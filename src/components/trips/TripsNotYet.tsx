import { getTranslations } from "next-intl/server";

// TRIPS T1.1 ▸ หน้าแท็บที่ยังไม่สร้าง (รอบและที่ว่าง T1.2 · การจอง T1.3 · เอเจนซี่ A1.2 · หน้าจองและช่องทาง W1.1) — ลิงก์ในแถบจึงไม่ตาย
export default async function TripsNotYet({ wo, titleKey }: { wo: string; titleKey: string }) {
  const t = await getTranslations("trips");
  return (
    <section data-testid="trips-not-yet" data-wo={wo} role="status" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6">
      <h1 className="text-lg font-bold text-[color:var(--color-ink)]">{t(titleKey)}</h1>
      <p className="text-sm font-medium text-[color:var(--color-ink)]">{t("notYet.title")}</p>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{t("notYet.body", { wo })}</p>
    </section>
  );
}
