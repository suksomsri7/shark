import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { hotelHostAllowed, hotelWebClientKey, publicStatus } from "@/lib/platform/hotel-web";
import { makeT } from "@/lib/i18n";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import { StatusCard, type StatusLine } from "@/components/store/hotel/StatusCard";
import { CancelDialog } from "@/components/store/hotel/CancelDialog";
import { HoldCountdown } from "@/components/store/hotel/HoldCountdown";
import { baht, dayLabel, pickLocale } from "@/components/store/hotel/format";
import { publicCancelAction } from "../../actions";
import { WebHeader, WebNotFound, WebShell, one, withLang, type PageSearch } from "../../_web";

export const dynamic = "force-dynamic";

const CANCEL_ERR: Record<string, string> = {
  REFUND_CHANGED: "hotel.web.err.refund",
  NOT_FOUND: "hotel.web.err.email",
  FORBIDDEN: "hotel.web.err.cancelOff",
  RATE_LIMITED: "hotel.web.err.rate",
};

// SVC H.8 ▸ S5 หน้าสถานะการจอง (ภาพ 16 ค · URL เดิมของ P1) — เปิดด้วย publicToken เท่านั้น · ไม่มีเบอร์ · อีเมล mask
//   HOLD = นับถอยหลัง + ปุ่มจ่าย · รอโรงแรมยืนยัน · ยืนยันแล้ว (มัดจำ ✓ · จ่ายที่โรงแรม · เช็กอิน/เอาต์) · เพิ่มเพื่อน LINE OA · ตม.30 · ยกเลิกเอง (แสดงยอดคืนก่อนยืนยัน)
export default async function HotelStatusPage({ params, searchParams }: { params: Promise<{ tenantSlug: string; unitSlug: string; publicToken: string }>; searchParams: Promise<PageSearch> }) {
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
  const cancel = one(sp.cancel);
  const money = (n: number) => baht(n, locale, true);
  const tone: "ok" | "wait" | "gone" = st.state === "CANCELLED" || st.state === "HOLD_EXPIRED" || st.state === "NO_SHOW" || st.state === "REFUNDED" ? "gone" : st.state === "HOLD" || st.state === "AWAITING_APPROVAL" ? "wait" : "ok";
  const title =
    st.state === "HOLD"
      ? t("hotel.web.awaitingPay", { code: st.code })
      : st.state === "AWAITING_APPROVAL"
        ? t("hotel.web.awaitingApproval", { code: st.code })
        : st.state === "HOLD_EXPIRED"
          ? t("hotel.web.expired", { code: st.code })
          : st.state === "CANCELLED"
            ? t("hotel.web.cancelled", { code: st.code })
            : st.state === "CONFIRMED"
              ? t("hotel.web.booked", { code: st.code })
              : st.state === "NO_SHOW"
                ? `${t("hotel.web.noShowState")} · ${st.code}`
                : `${t(`hotel.st.${st.state}`)} · ${st.code}`;
  const subtitle = `${st.roomTypeName}${st.rooms.length > 1 ? ` × ${st.rooms.length}` : ""} · ${dayLabel(st.checkIn, locale)} – ${dayLabel(st.checkOut, locale)} · ${t("hotel.web.adultsN", { n: st.adults })}`;
  const depositNote = st.deposit.paid ? `${t("hotel.web.deposit")} (${t("hotel.web.depositVerified")})` : st.deposit.slip && st.deposit.slip.status !== "REJECTED" ? `${t("hotel.web.deposit")} (${t("hotel.web.slipReview")})` : `${t("hotel.web.deposit")} (${t("hotel.web.unpaid")})`;
  const lines: StatusLine[] = [
    ...(st.deposit.requiredSatang > 0 ? [{ k: depositNote, v: `${money(st.deposit.requiredSatang)}${st.deposit.paid ? " ✓" : ""}`, strong: true }] : []),
    ...(st.state !== "CANCELLED" && st.state !== "HOLD_EXPIRED" ? [{ k: t("hotel.web.payAtHotel"), v: money(st.payAtHotelSatang) }] : []),
    ...(st.refundedSatang > 0 ? [{ k: t("hotel.web.refunded", { amount: baht(st.refundedSatang, locale) }), v: money(st.refundedSatang) }] : []),
    { k: t("hotel.web.checkTimes"), v: `${st.checkInTime} / ${st.checkOutTime}` },
  ];
  const lineId = st.lineAddFriendUrl ? st.lineAddFriendUrl.slice(st.lineAddFriendUrl.lastIndexOf("/") + 1) : "";
  const refund = st.refund?.refundSatang ?? 0;
  return (
    <WebShell>
      <WebHeader unitName={st.unitName} sub={t("hotel.web.statusTitle")} locale={locale} langHref={(l) => `${base}/r/${encodeURIComponent(publicToken)}?lang=${l}`} />
      {st.state === "HOLD" || st.deposit.slip?.status === "NEEDS_REVIEW" || st.state === "AWAITING_APPROVAL" ? <AutoRefresh ms={5000} /> : null}
      <div className="flex flex-col gap-3 px-4 pt-3">
        {cancel === "ok" ? <div className="rounded-2xl border border-[color:var(--color-line)] px-4 py-3 text-center text-sm font-semibold">{t("hotel.web.cancelDone")}</div> : null}
        {cancel && cancel !== "ok" ? (
          <div className="rounded-2xl border border-[color:var(--color-danger)] px-4 py-3 text-center text-sm text-[color:var(--color-danger)]">{t(CANCEL_ERR[cancel] ?? "hotel.web.err.failed")}</div>
        ) : null}
        <StatusCard tone={tone} title={title} subtitle={subtitle} lines={lines}>
          {st.state === "HOLD" && st.holdExpiresAt ? (
            <div className="flex flex-col items-center gap-2">
              <HoldCountdown expiresAt={st.holdExpiresAt} template={t("hotel.web.holdFor", { time: "{time}" })} expiredLabel={t("hotel.web.holdExpired")} />
              {st.pay ? (
                <Link href={withLang(`${base}/pay/${encodeURIComponent(publicToken)}`, lang)} className="btn btn-primary flex min-h-[52px] w-full items-center justify-center rounded-2xl text-base font-bold">
                  {t("hotel.web.payNow")}
                </Link>
              ) : null}
            </div>
          ) : null}
          {st.state === "CONFIRMED" && st.pay ? (
            <div className="flex flex-col items-center gap-2 rounded-[18px] border border-[color:var(--color-line)] px-4 py-4">
              <div className="text-sm">{t("hotel.web.payOptional")}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={st.pay.qrSvgDataUrl} alt="PromptPay QR" className="h-[160px] w-[160px]" />
              <div className="text-lg font-bold tabular-nums">฿{money(st.pay.amountSatang)}</div>
            </div>
          ) : null}
          {st.state === "HOLD_EXPIRED" ? (
            <Link href={withLang(base, lang)} className="btn btn-primary flex min-h-[52px] w-full items-center justify-center rounded-2xl text-base font-bold">
              {t("hotel.web.bookAgain")}
            </Link>
          ) : null}
          {st.lineAddFriendUrl ? (
            <a href={st.lineAddFriendUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] border-2 border-[color:var(--color-ink)] text-base font-bold" data-line-add="">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              {t("hotel.web.addLine", { id: lineId })}
            </a>
          ) : null}
          {st.state !== "CANCELLED" && st.state !== "HOLD_EXPIRED" ? <p className="text-center text-xs text-[color:var(--color-muted)]">{st.lineAddFriendUrl ? t("hotel.web.lineNote") : t("hotel.web.reschedule")}</p> : null}
          {st.state !== "CANCELLED" && st.state !== "HOLD_EXPIRED" ? (
            <div className="flex gap-2.5 rounded-[18px] bg-[color:var(--color-surface-2,#f4f4f5)] px-4 py-3 text-sm" data-tm30="">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-none" aria-hidden="true">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M4 10h16M9 3v4M15 3v4" />
              </svg>
              <div>
                <div className="font-semibold">{t("hotel.web.foreigner")}</div>
                <div className="text-xs text-[color:var(--color-muted)]">{t("hotel.web.tm30")}</div>
              </div>
            </div>
          ) : null}
          {!st.canCancel && st.cancelVia !== "SELF" && (st.state === "HOLD" || st.state === "AWAITING_APPROVAL" || st.state === "CONFIRMED") ? (
            <p className="text-center text-sm text-[color:var(--color-muted)]" data-cancel-via={st.cancelVia}>
              {t(st.cancelVia === "CHANNEL" ? "hotel.web.cancelAtChannel" : "hotel.web.cancelAtHotel")}
            </p>
          ) : null}
          {st.canCancel ? (
            <CancelDialog
              action={publicCancelAction}
              hidden={{ tenantSlug, unitSlug, publicToken, lang: lang ?? "" }}
              confirmRefundSatang={refund}
              labels={{ open: t("hotel.web.cancel"), refund: refund > 0 ? t("hotel.web.cancelRefund", { amount: baht(refund, locale, true) }) : t("hotel.web.cancelNoRefund"), email: t("hotel.web.cancelEmail"), confirm: t("hotel.web.cancelConfirm"), close: t("hotel.web.cancelClose") }}
            />
          ) : null}
        </StatusCard>
      </div>
    </WebShell>
  );
}
