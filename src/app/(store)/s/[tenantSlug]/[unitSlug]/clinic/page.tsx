import { cookies } from "next/headers";
import { resolveClinicUnit } from "@/lib/modules/clinic/service";
import { createPublicAppointmentAction } from "./actions";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// เวลา BKK สำหรับ min ของ datetime-local (กันเลือกอดีต) — "YYYY-MM-DDTHH:mm"
// ?err= จาก action เป็นรหัส → หน้าเป็นคนแปล
const ERR_CODES = new Set(["rate", "shop", "name", "phone", "when", "past", "failed"]);

function nowBkkLocal() {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16);
}

// หน้าขอนัดคลินิกออนไลน์ (public · ไม่ต้องล็อกอิน · ไม่เก็บเงินล่วงหน้า)
//   กรอกชื่อ/เบอร์/วันเวลาที่สะดวก/อาการเบื้องต้น → ขอนัด → รอร้านยืนยัน
export default async function PublicClinicPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveClinicUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("clinic.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("clinic.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;
  const minLocal = nowBkkLocal();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-8">
      <header className="flex items-start justify-between gap-3">
        <div className="flex-1 text-center">
          <div className="text-xl font-semibold">{unit.name}</div>
          <div className="text-sm text-[color:var(--color-muted)]">{tenant.name}</div>
        </div>
        <LanguageSwitcher locale={locale} />
      </header>

      {sp.err && (
        <div className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">
          {ERR_CODES.has(sp.err) ? t(`clinic.err.${sp.err}`) : t("err.general")}
        </div>
      )}

      <form action={createPublicAppointmentAction} className="card flex flex-col gap-3">
        <div className="text-base font-semibold">{t("clinic.formTitle")}</div>
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="unitSlug" value={unitSlug} />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("clinic.field.patient")}</span>
          <input
            name="patientName"
            required
            maxLength={120}
            placeholder={t("clinic.ph.patient")}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("clinic.field.phone")}</span>
          <input
            name="patientPhone"
            required
            inputMode="tel"
            maxLength={32}
            placeholder={t("clinic.ph.phone")}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("clinic.field.when")}</span>
          <input
            type="datetime-local"
            name="preferredAt"
            required
            min={minLocal}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">{t("clinic.field.symptom")}</span>
          <textarea
            name="symptom"
            maxLength={500}
            rows={2}
            placeholder={t("clinic.ph.symptom")}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </label>

        <button className="btn btn-primary min-h-[44px] text-base">{t("clinic.submit")}</button>
      </form>

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        {t("clinic.footer")}
      </p>
    </main>
  );
}
