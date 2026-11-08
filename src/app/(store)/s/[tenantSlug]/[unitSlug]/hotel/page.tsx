import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { hotelHostAllowed, hotelWebClientKey, publicInfo, publicSearch } from "@/lib/platform/hotel-web";
import { makeT } from "@/lib/i18n";
import { SearchBar } from "@/components/store/hotel/SearchBar";
import { RoomTypeCard } from "@/components/store/hotel/RoomTypeCard";
import { addDays, isYmdStr, pickLocale } from "@/components/store/hotel/format";
import { WebHeader, WebNotFound, WebShell, one, withLang, type PageSearch } from "./_web";

export const dynamic = "force-dynamic";

// SVC H.8 ▸ S1+S2 หน้าค้นหาห้อง (ภาพ 16 ก · มือถือ 390) — ราคาตามคืนจริง + แผนราคาที่เปิดเว็บ · เหลือ N ห้อง · ห้องเต็มบอกคืนที่เต็ม
//   ทุกการอ่านผ่าน platform/hotel-web (rate limit ต่อ IP+หน่วย) · โดเมนของร้านอื่นเปิดหน้านี้ไม่ได้ (§9.5)
export default async function HotelSearchPage({ params, searchParams }: { params: Promise<{ tenantSlug: string; unitSlug: string }>; searchParams: Promise<PageSearch> }) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const h = await headers();
  if (!(await hotelHostAllowed(h.get("host"), tenantSlug))) notFound();
  const locale = pickLocale(sp.lang, (await cookies()).get("lang")?.value);
  const lang = one(sp.lang) === "en" || one(sp.lang) === "th" ? one(sp.lang) : null;
  const t = makeT(locale);
  const clientKey = hotelWebClientKey(h);
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const info = await publicInfo({ tenantSlug, unitSlug }, { clientKey });
  if (!info.ok) {
    return info.code === "RATE_LIMITED" ? <WebNotFound title={t("hotel.web.err.rate")} desc="" /> : <WebNotFound title={t("hotel.notFound.title")} desc={t("hotel.notFound.desc")} />;
  }
  const today = info.today;
  let checkIn = isYmdStr(one(sp.checkIn)) ? one(sp.checkIn) : today;
  if (checkIn < today) checkIn = today;
  let checkOut = isYmdStr(one(sp.checkOut)) ? one(sp.checkOut) : addDays(checkIn, 1);
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
  const adults = Math.min(20, Math.max(1, Math.trunc(Number(one(sp.adults)) || 2)));
  const rooms = Math.min(info.maxRooms, Math.max(1, Math.trunc(Number(one(sp.rooms)) || 1)));
  const r = info.open ? await publicSearch({ tenantSlug, unitSlug, checkIn, checkOut, adults, children: 0, rooms }, { clientKey }) : null;
  const badge = locale === "en" ? info.badgeEn : info.badgeTh;
  const desc = locale === "en" ? info.descriptionEn : info.descriptionTh;
  const qs = `checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&rooms=${rooms}`;
  const langHref = (l: string) => `${base}?${qs}&lang=${l}`;
  const bookHref = (roomTypeId: string) => (planId: string) => withLang(`${base}/book?${qs}&roomTypeId=${encodeURIComponent(roomTypeId)}&ratePlanId=${encodeURIComponent(planId)}`, lang);
  const nights = r && r.ok ? r.nights : Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000));
  return (
    <WebShell>
      <WebHeader unitName={info.unitName} sub={badge} locale={locale} langHref={langHref} />
      <div className="flex flex-col gap-3 px-4 pt-3">
        {info.heroImages[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.heroImages[0]} alt={info.unitName} className="h-[140px] w-full rounded-[18px] object-cover" />
        ) : null}
        {desc ? <p className="text-sm text-[color:var(--color-muted)]">{desc}</p> : null}
        {!info.open ? (
          <div className="rounded-2xl border border-[color:var(--color-line)] px-4 py-6 text-center text-sm" data-hotel-closed="">
            {t("hotel.web.closed")}
          </div>
        ) : (
          <>
            <SearchBar
              action={base}
              checkIn={checkIn}
              checkOut={checkOut}
              adults={adults}
              rooms={rooms}
              today={today}
              maxRooms={info.maxRooms}
              lang={lang}
              labels={{
                checkIn: t("hotel.web.checkIn"),
                checkOut: t("hotel.web.checkOut"),
                guests: t("hotel.web.guests"),
                rooms: t("hotel.web.rooms"),
                search: t("hotel.web.search"),
                adultsN: (n) => t("hotel.web.adultsN", { n }),
                roomsN: (n) => t("hotel.web.roomsN", { n }),
              }}
            />
            <div className="text-center text-xs text-[color:var(--color-muted)]">{t("hotel.web.from", { n: nights })}</div>
            {r && !r.ok ? (
              <div className="rounded-2xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">
                {r.code === "RATE_LIMITED" ? t("hotel.web.err.rate") : r.code === "CLOSED" ? t("hotel.web.closed") : r.reason}
              </div>
            ) : null}
            {r && r.ok && r.roomTypes.length === 0 ? <div className="rounded-2xl border px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">{t("hotel.web.noRooms")}</div> : null}
            {r && r.ok
              ? r.roomTypes.map((rt) => (
                  <RoomTypeCard
                    key={rt.id}
                    rt={{ id: rt.id, name: rt.name, images: rt.images, remaining: rt.remaining, lowStock: rt.lowStock, soldOutDates: rt.soldOutDates, plans: rt.plans.map((p) => ({ id: p.id, name: p.name, totalSatang: p.totalSatang, nights: p.nights, cancelSummary: locale === "en" ? p.cancelSummaryEn : p.cancelSummaryTh })) }}
                    rooms={rooms}
                    locale={locale}
                    bookHref={bookHref(rt.id)}
                    labels={{
                      photo: t("hotel.web.photo", { name: rt.name }),
                      left: (n) => t("hotel.web.left", { n }),
                      soldOutOn: (dates) => t("hotel.web.soldOutOn", { dates }),
                      tryOtherDates: t("hotel.web.tryOtherDates"),
                      perNights: (price, n) => t("hotel.web.perNights", { price, n }),
                    }}
                  />
                ))
              : null}
          </>
        )}
        <Link href={withLang(`${base}/my`, lang)} className="mt-2 text-center text-sm font-semibold underline-offset-2 hover:underline">
          {t("hotel.web.myBooking")}
        </Link>
      </div>
    </WebShell>
  );
}
