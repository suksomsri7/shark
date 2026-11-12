import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { hotelHostAllowed, hotelWebClientKey, publicInfo, publicQuote } from "@/lib/platform/hotel-web";
import { getLocaleFromCookie, makeT } from "@/lib/i18n";
import { BookingForm } from "@/components/store/hotel/BookingForm";
import { baht, isYmdStr, pickLocale, rangeLabel } from "@/components/store/hotel/format";
import { publicCreateHoldAction } from "../actions";
import { WebHeader, WebNotFound, WebShell, one, withLang, type PageSearch } from "../_web";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  RATE_LIMITED: "hotel.web.err.rate",
  AVAILABILITY_CHANGED: "hotel.web.err.full",
  CLOSED: "hotel.web.err.closed",
  TOO_MANY_ROOMS: "hotel.web.err.tooMany",
  PLAN_NOT_PUBLIC: "hotel.web.err.plan",
  INVALID_INPUT: "hotel.web.err.input",
  CONTACT_REQUIRED: "hotel.web.err.contact", // SVC H.8 r2 ◂
  TOO_MANY_HOLDS: "hotel.web.err.holds", // SVC H.8 r2 ◂
};

// SVC H.8 ▸ S3 ยืนยันการจอง (ภาพ 16 ข ส่วนบน) — สรุปราคา (ค่าห้อง · มัดจำตอนนี้ · จ่ายที่โรงแรม) · คูปอง (หักตอนเช็กเอาต์) · เงื่อนไขยกเลิกเต็ม · ฟอร์มผู้เข้าพัก
export default async function HotelBookPage({ params, searchParams }: { params: Promise<{ tenantSlug: string; unitSlug: string }>; searchParams: Promise<PageSearch> }) {
  const { tenantSlug, unitSlug } = await params;
  const sp = await searchParams;
  const h = await headers();
  if (!(await hotelHostAllowed(h.get("host"), tenantSlug))) notFound();
  const locale = pickLocale(sp.lang, getLocaleFromCookie((await cookies()).get("lang")?.value));
  const lang = one(sp.lang) === "en" || one(sp.lang) === "th" ? one(sp.lang) : null;
  const t = makeT(locale);
  const clientKey = hotelWebClientKey(h);
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const checkIn = one(sp.checkIn);
  const checkOut = one(sp.checkOut);
  const roomTypeId = one(sp.roomTypeId);
  const ratePlanId = one(sp.ratePlanId);
  const adults = Math.min(20, Math.max(1, Math.trunc(Number(one(sp.adults)) || 2)));
  const rooms = Math.min(10, Math.max(1, Math.trunc(Number(one(sp.rooms)) || 1)));
  const couponCode = one(sp.coupon).trim().slice(0, 40);
  const qs = `checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&rooms=${rooms}`;
  const backHref = withLang(`${base}?${qs}`, lang);
  if (!isYmdStr(checkIn) || !isYmdStr(checkOut) || !roomTypeId) return <WebNotFound title={t("hotel.web.err.input")} desc="" href={backHref} cta={t("hotel.web.back")} />;
  const info = await publicInfo({ tenantSlug, unitSlug }, { clientKey });
  if (!info.ok) return <WebNotFound title={t("hotel.notFound.title")} desc={t("hotel.notFound.desc")} />;
  const q = await publicQuote(
    { tenantSlug, unitSlug, checkIn, checkOut, adults, children: 0, rooms: [{ roomTypeId, qty: rooms, ...(ratePlanId ? { ratePlanId } : {}) }], couponCode: couponCode || null },
    { clientKey },
  );
  const selfHref = (extra: string) => `${base}/book?${qs}&roomTypeId=${encodeURIComponent(roomTypeId)}&ratePlanId=${encodeURIComponent(ratePlanId)}${extra}`;
  const langHref = (l: string) => selfHref(`${couponCode ? `&coupon=${encodeURIComponent(couponCode)}` : ""}&lang=${l}`);
  const err = one(sp.err);
  if (!q.ok) {
    return (
      <WebShell>
        <WebHeader unitName={info.unitName} sub={t("hotel.web.confirmTitle")} locale={locale} langHref={langHref} />
        <WebNotFound title={ERR[q.code] ? t(ERR[q.code], { n: info.maxRooms }) : q.reason} desc="" href={backHref} cta={t("hotel.web.back")} />
      </WebShell>
    );
  }
  const line = q.lines[0];
  const discount = q.discountSatang;
  const depositKind = q.firstNightDeposit ? t("hotel.web.depositFirstNight") : q.depositSatang >= q.totalSatang ? t("hotel.web.depositFull") : "";
  const policy = locale === "en" ? q.cancelSummaryEn : q.cancelSummaryTh;
  const rowCls = "flex items-baseline gap-2 text-sm";
  const dots = <span className="flex-1 border-b border-dotted border-[color:var(--color-line)]" />;
  return (
    <WebShell>
      <WebHeader unitName={info.unitName} sub={locale === "en" ? info.badgeEn : info.badgeTh} locale={locale} langHref={langHref} />
      <div className="flex flex-col gap-3 px-4 pt-3">
        <div className="flex items-center gap-2">
          <Link href={backHref} aria-label={t("hotel.web.back")} className="grid h-9 w-9 place-items-center rounded-full">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">{t("hotel.web.confirmTitle")}</h1>
        </div>
        {err ? (
          <div className="rounded-2xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]" data-book-error={err}>
            {ERR[err] ? t(ERR[err], { n: info.maxRooms }) : t("hotel.web.err.failed")}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 rounded-[18px] border border-[color:var(--color-line)] px-4 py-3">
          <div className={rowCls}>
            <span className="text-[color:var(--color-muted)]">
              {line?.roomTypeName}
              {rooms > 1 ? ` × ${rooms}` : ""} · {rangeLabel(q.checkIn, q.checkOut, locale)} · {t("hotel.web.nightsN", { n: q.nights })}
            </span>
            {dots}
            <b className="tabular-nums">{baht(q.totalSatang, locale, true)}</b>
          </div>
          {discount > 0 ? (
            <div className={rowCls}>
              <span className="text-[color:var(--color-muted)]">{t("hotel.web.couponOk", { amount: baht(discount, locale) })}</span>
              {dots}
              <b className="tabular-nums">−{baht(discount, locale, true)}</b>
            </div>
          ) : null}
          {q.depositSatang > 0 ? (
            <div className={rowCls}>
              <span className="text-[color:var(--color-muted)]">
                {t("hotel.web.depositNow")}
                {depositKind ? ` (${depositKind})` : ""}
              </span>
              {dots}
              <b className="tabular-nums">{baht(q.depositSatang, locale, true)}</b>
            </div>
          ) : (
            <div className="text-sm text-[color:var(--color-muted)]">{t("hotel.web.noDeposit")}</div>
          )}
          <div className={rowCls}>
            <span className="text-[color:var(--color-muted)]">{t("hotel.web.payAtHotel")}</span>
            {dots}
            <b className="tabular-nums">{baht(q.payAtHotelSatang, locale, true)}</b>
          </div>
        </div>
        <form method="get" action={`${base}/book`} className="flex gap-2">
          {Object.entries({ checkIn, checkOut, adults: String(adults), rooms: String(rooms), roomTypeId, ratePlanId, ...(lang ? { lang } : {}) }).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input name="coupon" defaultValue={couponCode} maxLength={40} placeholder={t("hotel.web.coupon")} className="min-h-[44px] flex-1 rounded-2xl border border-[color:var(--color-line)] px-3 text-sm uppercase" />
          <button className="min-h-[44px] rounded-2xl border border-[color:var(--color-ink)] px-4 text-sm font-semibold">{t("hotel.web.couponApply")}</button>
        </form>
        {q.coupon && !q.coupon.ok ? <div className="text-xs text-[color:var(--color-danger)]">{t("hotel.web.couponBad")}</div> : null}
        <div className="flex gap-2.5 rounded-[18px] bg-[color:var(--color-surface-2,#f4f4f5)] px-4 py-3 text-sm" data-cancel-policy="">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none" aria-hidden="true">
            <path d="M7 3h7l4 4v14H7z" />
            <path d="M14 3v4h4" />
          </svg>
          <div>
            <div className="font-semibold">{policy}</div>
            {q.depositSatang > 0 ? <div className="text-xs text-[color:var(--color-muted)]">{t("hotel.web.noShow")}</div> : null}
          </div>
        </div>
        <div className="text-sm font-semibold">{t("hotel.web.guests")}</div>
        <BookingForm
          action={publicCreateHoldAction}
          formToken={info.formToken}
          idemKey={randomUUID()}
          hidden={{ tenantSlug, unitSlug, checkIn, checkOut, adults: String(adults), rooms: String(rooms), roomTypeId, ratePlanId: q.ratePlan.id, couponCode: q.coupon?.ok ? couponCode : "", locale, lang: lang ?? "" }}
          labels={{ guestName: t("hotel.web.guestName"), phone: t("hotel.web.phone"), email: t("hotel.web.email"), policyAccept: t("hotel.web.policyAccept"), submit: t("hotel.web.submit"), submitting: t("hotel.web.submitting") }}
        />
      </div>
    </WebShell>
  );
}
