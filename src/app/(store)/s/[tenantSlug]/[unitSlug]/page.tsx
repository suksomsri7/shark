import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveUnit, getBookingData } from "@/lib/modules/booking/service";
import { resolveUnit as resolveTicketUnit } from "@/lib/modules/ticket/service";
import { resolveRentalUnit } from "@/lib/modules/rental/service";
import { resolveSchoolUnit } from "@/lib/modules/school/service";
import { resolveClinicUnit } from "@/lib/modules/clinic/service";
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

  // ร้านขายตั๋ว (TICKET): landing เด้งเข้า storefront ตั๋วสาธารณะ (ลูกค้าซื้อตั๋วเอง)
  const ticketUnit = await resolveTicketUnit(tenantSlug, unitSlug);
  if (ticketUnit) redirect(`/s/${tenantSlug}/${unitSlug}/ticket`);

  // ร้านให้เช่า (RENTAL): landing เด้งเข้า storefront เช่าสาธารณะ (ลูกค้าจองเช่าเอง)
  const rentalUnit = await resolveRentalUnit(tenantSlug, unitSlug);
  if (rentalUnit) redirect(`/s/${tenantSlug}/${unitSlug}/rental`);

  // โรงเรียน/สถาบัน (SCHOOL): landing เด้งเข้า storefront สมัครเรียนสาธารณะ (ผู้ปกครองสมัคร+จ่ายเอง)
  const schoolUnit = await resolveSchoolUnit(tenantSlug, unitSlug);
  if (schoolUnit) redirect(`/s/${tenantSlug}/${unitSlug}/school`);

  // คลินิก (CLINIC): landing เด้งเข้า storefront ขอนัดสาธารณะ (ผู้ป่วยจองนัดเอง)
  const clinicUnit = await resolveClinicUnit(tenantSlug, unitSlug);
  if (clinicUnit) redirect(`/s/${tenantSlug}/${unitSlug}/clinic`);

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
