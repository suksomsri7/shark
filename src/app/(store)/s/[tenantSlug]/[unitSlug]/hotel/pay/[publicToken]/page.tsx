import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { hotelHostAllowed, hotelWebClientKey, publicStatus } from "@/lib/platform/hotel-web";
import { makeT } from "@/lib/i18n";
import { DepositPay } from "@/components/store/hotel/DepositPay";
import { HoldCountdown } from "@/components/store/hotel/HoldCountdown";
import { baht, pickLocale, rangeLabel } from "@/components/store/hotel/format";
import { WebHeader, WebNotFound, WebShell, one, withLang, type PageSearch } from "../../_web";

export const dynamic = "force-dynamic";

// SVC H.8 ▸ S4 จ่ายมัดจำ (ภาพ 16 ข) — นับถอยหลังถือห้อง · สรุปเงิน · เงื่อนไขยกเลิก · QR พร้อมเพย์ยอดล็อก · แนบสลิป (สลิปกลาง → คิวพนักงาน)
//   จ่ายแล้ว/ไม่ต้องจ่าย/หมดเวลา ⇒ ไปหน้าสถานะ (เซิร์ฟเวอร์ตัดสินเสมอ)
export default async function HotelPayPage({ params, searchParams }: { params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>; searchParams: Promise<PageSearch> }) {
  const { tenantSlug, unitSlug, publicToken } = await params;
  const sp = await searchParams;
  const h = await headers();
  if (!(await hotelHostAllowed(h.get("host"), tenantSlug))) notFound();
  const locale = pickLocale(sp.lang, (await cookies()).get("lang")?.value);
  const lang = one(sp.lang) === "en" || one(sp.lang) === "th" ? one(sp.lang) : null;
  const t = makeT(locale);
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/hotel`;
  const st = await publicStatus({ tenantSlug, unitSlug, publicToken }, { clientKey: hotelWebClientKey(h) });
  if (!st.ok) return <WebNotFound title={st.code === "RATE_LIMITED" ? t("hotel.web.err.rate") : t("hotel.rv.notFound.title")} desc={st.code === "RATE_LIMITED" ? "" : t("hotel.rv.notFound.desc")} href={withLang(base, lang)} cta={t("hotel.rv.bookCta")} />;
  const statusHref = withLang(`${base}/r/${encodeURIComponent(publicToken)}`, lang);
  if (!st.pay && !(st.state === "HOLD" && st.deposit.slip)) redirect(statusHref);
  const slip = one(sp.slip);
  const slipState: "none" | "sent" | "bad" = slip === "ok" || slip === "pending" || st.deposit.slip?.status === "NEEDS_REVIEW" || st.deposit.slip?.status === "PENDING" ? "sent" : slip === "bad" || slip === "rate" ? "bad" : "none";
  const policy = st.cancelRules;
  const policyText = (() => {
    const free = policy.find((r) => r.refundBp >= 10_000 && r.daysBefore > 0);
    if (!free) return t("hotel.web.policyNonRef");
    const until = new Date(`${st.checkIn}T00:00:00.000Z`);
    until.setUTCDate(until.getUTCDate() - free.daysBefore);
    const d = until.toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
    return t("hotel.web.policyFreeUntil", { date: d });
  })();
  const rowCls = "flex items-baseline gap-2 text-sm";
  const dots = <span className="flex-1 border-b border-dotted border-[color:var(--color-line)]" />;
  const amount = st.pay?.amountSatang ?? st.deposit.requiredSatang;
  return (
    <WebShell>
      <WebHeader unitName={st.unitName} sub={t("hotel.web.confirmTitle")} locale={locale} langHref={(l) => `${base}/pay/${encodeURIComponent(publicToken)}?lang=${l}`} />
      <div className="flex flex-col gap-3 px-4 pt-3">
        <div className="flex items-center gap-2">
          <Link href={statusHref} aria-label={t("hotel.web.back")} className="grid h-9 w-9 place-items-center rounded-full">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">{t("hotel.web.confirmTitle")}</h1>
          <span className="flex-1" />
          {st.holdExpiresAt ? <HoldCountdown expiresAt={st.holdExpiresAt} template={t("hotel.web.holdFor", { time: "{time}" })} expiredLabel={t("hotel.web.holdExpired")} /> : null}
        </div>
        <div className="flex flex-col gap-2 rounded-[18px] border border-[color:var(--color-line)] px-4 py-3">
          <div className={rowCls}>
            <span className="text-[color:var(--color-muted)]">
              {st.roomTypeName}
              {st.rooms.length > 1 ? ` × ${st.rooms.length}` : ""} · {rangeLabel(st.checkIn, st.checkOut, locale)} · {t("hotel.web.nightsN", { n: st.nights })}
            </span>
            {dots}
            <b className="tabular-nums">{baht(st.totalSatang, locale, true)}</b>
          </div>
          <div className={rowCls}>
            <span className="text-[color:var(--color-muted)]">{t("hotel.web.depositNow")}</span>
            {dots}
            <b className="tabular-nums">{baht(amount, locale, true)}</b>
          </div>
          <div className={rowCls}>
            <span className="text-[color:var(--color-muted)]">{t("hotel.web.payAtHotel")}</span>
            {dots}
            <b className="tabular-nums">{baht(st.payAtHotelSatang, locale, true)}</b>
          </div>
        </div>
        <div className="flex gap-2.5 rounded-[18px] bg-[color:var(--color-surface-2,#f4f4f5)] px-4 py-3 text-sm">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none" aria-hidden="true">
            <path d="M7 3h7l4 4v14H7z" />
            <path d="M14 3v4h4" />
          </svg>
          <div>
            <div className="font-semibold">{policyText}</div>
            <div className="text-xs text-[color:var(--color-muted)]">{t("hotel.web.noShow")}</div>
          </div>
        </div>
        <DepositPay
          qrSvgDataUrl={st.pay?.qrSvgDataUrl ?? null}
          slipUrl={`${base}/slip/${encodeURIComponent(publicToken)}${lang ? `?lang=${lang}` : ""}`}
          slipState={slipState}
          labels={{ amount: `฿${baht(amount, locale, true)}`, note: t("hotel.web.qrNote"), attach: t("hotel.web.attachSlip"), sent: t("hotel.web.slipSent"), bad: slip === "rate" ? t("hotel.web.err.rate") : t("hotel.web.slipBad"), noReceiver: t("hotel.web.noReceiver") }}
        />
      </div>
    </WebShell>
  );
}
