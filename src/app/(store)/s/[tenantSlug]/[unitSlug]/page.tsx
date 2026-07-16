import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { resolveUnit, getBookingData } from "@/lib/modules/booking/service";
import { PublicBooking } from "@/components/public-booking";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// หน้าจองสาธารณะของกิจการ (BOOKING) — /s/[tenantSlug]/[unitSlug]
export default async function StoreBookingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const resolved = await resolveUnit(tenantSlug, unitSlug);
  if (!resolved) notFound();
  const { services, staff } = await getBookingData(resolved.tenant.id, resolved.unit.id);

  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-widest text-[color:var(--color-muted)]">
            {resolved.tenant.name}
          </div>
          <h1 className="text-2xl font-semibold">{resolved.unit.name}</h1>
          <p className="text-sm text-[color:var(--color-muted)]">{t("booking.subtitle")}</p>
        </div>
        <LanguageSwitcher locale={locale} />
      </div>
      <PublicBooking
        tenantSlug={tenantSlug}
        unitSlug={unitSlug}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMin: s.durationMin,
          priceSatang: s.priceSatang,
        }))}
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        locale={locale}
      />
    </main>
  );
}
