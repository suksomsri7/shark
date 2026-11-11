// /q/o/<orderToken> — order status of a pre-order (POS P2.7 S doors · P2.7U page · §1 c · ruling 3 4 11 15 · 19ค expired copy).
// Public: no session, noindex, force-dynamic. Server part: token shape -> notFound() · orderStatus (the read writes nothing except the one-time
// expiry when payBy has passed · S2) · frame. Client island (components/pos/qr/QrOrderStatusApp): pay QR + countdown + claim (static) / Beam auto ·
// paid · accepted · ready · handed · expired · rejected · cancelled · receipt link; polls orderStatus with sinceVer every 5 s, pauses on hidden tabs.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import thPos from "@/messages/th/pos.json";
import enPos from "@/messages/en/pos.json";
import { orderStatus } from "@/lib/modules/pos/qr-order";
import { isOrderToken } from "@/lib/modules/pos/qr-order-shared";
import { posPublicClientIp } from "@/lib/modules/pos/public-rate"; // POS P5.2 ▸ CD-P52-F3 ◂
import { QrNoticeCard, QrPublicFrame } from "@/components/pos/qr/QrPublicFrame";
import { QrOrderStatusApp } from "@/components/pos/qr/QrOrderStatusApp";
import { claimPaidAction, orderStatusAction } from "../../actions";
import { qrLocale, qrT } from "../../qr-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
const MSGS = { th: thPos, en: enPos } as const;

export default async function QrOrderStatusPage({ params, searchParams }: { params: Promise<{ orderToken: string }>; searchParams: Promise<{ lang?: string; e?: string }> }) {
  const { orderToken } = await params;
  if (!isOrderToken(orderToken)) notFound();
  const { lang, e } = await searchParams;
  const locale = await qrLocale(lang);
  const t = qrT(locale);
  const text = { th: t("common.th"), en: t("common.en"), language: t("common.language") };
  const r = await orderStatus(orderToken, {}, { ip: await posPublicClientIp() }); // POS P5.2 ▸ CD-P52-F3: per-IP read limit ◂
  if (!r.ok) {
    return (
      <QrPublicFrame testid="pos-qr-order-page" shop={null} sub="" locale={locale} text={text} data={{ state: "invalid" }}>
        <QrNoticeCard testid="pos-qr-invalid" title={t(r.messageKey)} body={t("common.invalidBody")} />
      </QrPublicFrame>
    );
  }
  if (!r.changed) notFound();
  const v = r.view;
  const notice = typeof e === "string" && /^qr\.[a-zA-Z.]+$/.test(e) ? e : null;
  return (
    <QrPublicFrame
      testid="pos-qr-order-page"
      shop={v.shop ?? { name: v.unit.name, logoUrl: null, branch: v.unit.name }}
      sub={t("status.sub", { branch: v.shop?.branch ?? v.unit.name })}
      locale={locale}
      text={text}
      data={{ state: "ok" }}
      footer={t("common.footer")}
    >
      <NextIntlClientProvider locale={locale} timeZone="Asia/Bangkok" messages={{ pos: { qr: MSGS[locale].qr } }}>
        <QrOrderStatusApp token={orderToken} locale={locale} initial={v} ver={r.ver} notice={notice} actions={{ status: orderStatusAction, claim: claimPaidAction }} />
      </NextIntlClientProvider>
    </QrPublicFrame>
  );
}
