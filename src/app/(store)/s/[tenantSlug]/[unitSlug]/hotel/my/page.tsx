import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { hotelHostAllowed, hotelWebClientKey, publicInfo } from "@/lib/platform/hotel-web";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { LookupForm } from "@/components/store/hotel/LookupForm";
import { pickLocale } from "@/components/store/hotel/format";
import { publicLookupAction } from "../actions";
import { WebHeader, WebNotFound, WebShell, one, withLang, type PageSearch } from "../_web";

export const dynamic = "force-dynamic";

// SVC H.8 ▸ S6 ดูการจองของฉัน — รหัสการจอง + อีเมล (คู่ต้องตรงเป๊ะ) ⇒ หน้าสถานะ · ไม่พบ = ข้อความเดียว (ไม่บอกว่ารหัสมีจริง) · ไม่มีค้นด้วยชื่อ
export default async function HotelMyBookingPage({ params, searchParams }: { params: Promise<{ tenantSlug: string; unitSlug: string }>; searchParams: Promise<PageSearch> }) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const h = await headers();
  if (!(await hotelHostAllowed(h.get("host"), tenantSlug))) notFound();
  const locale = pickLocale(sp.lang, getLocaleFromCookie((await cookies()).get("lang")?.value));
  const lang = one(sp.lang) === "en" || one(sp.lang) === "th" ? one(sp.lang) : null;
  const t = makeT(locale);
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const info = await publicInfo({ tenantSlug, unitSlug }, { clientKey: hotelWebClientKey(h) });
  if (!info.ok) return <WebNotFound title={info.code === "RATE_LIMITED" ? t("hotel.web.err.rate") : t("hotel.notFound.title")} desc={info.code === "RATE_LIMITED" ? "" : t("hotel.notFound.desc")} />;
  const err = one(sp.err);
  return (
    <WebShell>
      <WebHeader unitName={info.unitName} sub={t("hotel.web.myBooking")} locale={locale} langHref={(l) => `${base}/my?lang=${l}`} />
      <div className="flex flex-col gap-3 px-4 pt-4">
        <h1 className="text-xl font-bold">{t("hotel.web.myBooking")}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">{t("hotel.web.my.desc")}</p>
        {err ? (
          <div className="rounded-2xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]" data-lookup-error="">
            {err === "rate" ? t("hotel.web.err.rate") : t("hotel.web.my.notFound")}
          </div>
        ) : null}
        <LookupForm action={publicLookupAction} hidden={{ tenantSlug, unitSlug, lang: lang ?? "" }} labels={{ code: t("hotel.web.my.code"), email: t("hotel.web.cancelEmail"), find: t("hotel.web.my.find") }} />
        <Link href={withLang(base, lang)} className="text-center text-sm font-semibold">
          {t("hotel.rv.bookCta")}
        </Link>
      </div>
    </WebShell>
  );
}
