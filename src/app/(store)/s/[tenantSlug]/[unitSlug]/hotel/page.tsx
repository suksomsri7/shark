import { cookies } from "next/headers";
import {
  resolveHotelUnit,
  listPublicAvailability,
  todayBkk,
  addDaysStr,
  nightsBetween,
} from "@/lib/modules/hotel/service";
import { createPublicReservationAction } from "./actions";
import { getLocaleFromCookie, makeT, type Locale } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const dynamic = "force-dynamic";

// ฿ คงเดิมทั้งสองภาษา · ตัวเลขจัดกลุ่มตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

// ?err= จาก action เป็น "รหัส" ไม่ใช่ข้อความ → แปลตาม locale ตรงนี้ (รหัสแปลกปลอม = ข้อความกลาง)
const ERR_CODES = new Set(["rate", "shop", "dates", "roomType", "name", "phone", "failed"]);

// หน้าจองห้องพักออนไลน์ (public · ไม่ต้องล็อกอิน) — เลือกช่วงวัน → ดูห้องว่าง → จอง → จ่ายมัดจำ
export default async function PublicHotelBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; unitSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; err?: string }>;
}) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  const t = makeT(locale);

  const resolved = await resolveHotelUnit(tenantSlug, unitSlug);
  if (!resolved) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
        <div className="text-lg font-semibold">{t("hotel.notFound.title")}</div>
        <p className="mt-2 text-sm text-[color:var(--color-muted)]">{t("hotel.notFound.desc")}</p>
      </main>
    );
  }
  const { tenant, unit } = resolved;

  // ช่วงวันที่: default วันนี้ → พรุ่งนี้ · เข้าพักในอดีต/ช่วงพลิก → ปรับให้ถูกต้อง
  const today = todayBkk();
  let from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  if (from < today) from = today;
  let to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : addDaysStr(from, 1);
  if (nightsBetween(from, to) < 1) to = addDaysStr(from, 1);
  const nights = nightsBetween(from, to);

  const rooms = await listPublicAvailability(tenant.id, unit.id, from, to);
  const hasRooms = rooms.length > 0;

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
          {ERR_CODES.has(sp.err) ? t(`hotel.err.${sp.err}`) : t("err.general")}
        </div>
      )}

      {/* เลือกช่วงวันที่ (GET — โหลดห้องว่างใหม่) */}
      <form method="get" className="card flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">{t("hotel.checkin")}</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              min={today}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">{t("hotel.checkout")}</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              min={addDaysStr(from, 1)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button className="btn btn-primary min-h-[44px] text-base">{t("hotel.search")}</button>
      </form>

      <div className="text-center text-sm text-[color:var(--color-muted)]">
        {t("hotel.range", { nights, from, to })}
      </div>

      {/* รายการห้องว่าง */}
      {!hasRooms ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
          {t("hotel.noRooms")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map((rt) => {
            const total = rt.baseRateSatang * nights;
            const soldOut = rt.free < 1;
            return (
              <div key={rt.id} className="card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{rt.name}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">
                      {t("hotel.capacity", { n: rt.capacity })} · ฿{baht(rt.baseRateSatang, locale)}
                      {t("hotel.perNight")}
                      {rt.depositSatang > 0
                        ? ` · ${t("hotel.depositAmount", { amount: baht(rt.depositSatang, locale) })}`
                        : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold">฿{baht(total, locale)}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">{t("hotel.nights", { n: nights })}</div>
                  </div>
                </div>

                {soldOut ? (
                  <div className="rounded-lg bg-[color:var(--color-surface-2,#f5f5f5)] px-3 py-2 text-center text-sm text-[color:var(--color-muted)]">
                    {t("hotel.soldOut")}
                  </div>
                ) : (
                  <form action={createPublicReservationAction} className="flex flex-col gap-2">
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="unitSlug" value={unitSlug} />
                    <input type="hidden" name="roomTypeId" value={rt.id} />
                    <input type="hidden" name="from" value={from} />
                    <input type="hidden" name="to" value={to} />
                    <input
                      name="guestName"
                      required
                      maxLength={120}
                      placeholder={t("hotel.form.name")}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      name="guestPhone"
                      required
                      inputMode="tel"
                      maxLength={32}
                      placeholder={t("hotel.form.phone")}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <button className="btn btn-primary min-h-[44px] text-base">
                      {t("hotel.book")}
                      {rt.depositSatang > 0
                        ? ` · ${t("hotel.depositAmount", { amount: baht(rt.depositSatang, locale) })}`
                        : ""}
                    </button>
                    {rt.free <= 3 && (
                      <div className="text-center text-xs text-[color:var(--color-muted)]">
                        {t("hotel.left", { n: rt.free })}
                      </div>
                    )}
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        {t("hotel.footer")}
      </p>
    </main>
  );
}
