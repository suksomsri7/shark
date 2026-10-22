// /q/<linkToken> — pre-order, pay first (POS P2.7 S doors · P2.7U page · §1 b · ruling 3 4 7 11 15).
// Public: no session, noindex, force-dynamic. Server part: token shape -> notFound() · linkDoor · frame with the receipt header source.
// Client island (components/pos/qr/QrPreorderApp): menu · cart (server quote) · pickup name + Thai phone (PDPA line) · place (one idempotency key per
// cart + customer) -> /q/o/<orderToken>. Pickup ASAP only ("ready in about N min" · ruling 7).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import thPos from "@/messages/th/pos.json";
import enPos from "@/messages/en/pos.json";
import { linkDoor } from "@/lib/modules/pos/qr-order";
import { isLinkToken } from "@/lib/modules/pos/qr-order-shared";
import { posPublicClientIp } from "@/lib/modules/pos/public-rate"; // POS P5.2 ▸ CD-P52-F3 ◂
import { QrNoticeCard, QrPublicFrame } from "@/components/pos/qr/QrPublicFrame";
import { QrPreorderApp } from "@/components/pos/qr/QrPreorderApp";
import { placePreorderAction, placeTaggedPreorderAction, quotePreorderCartAction } from "../actions"; // POS P3.7 ▸ + placeTaggedPreorderAction ◂
import { qrLocale, qrT } from "../qr-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
const MSGS = { th: thPos, en: enPos } as const;

export default async function QrPreorderPage({ params, searchParams }: { params: Promise<{ linkToken: string }>; searchParams: Promise<{ lang?: string; e?: string; c?: string }> }) {
  const { linkToken } = await params;
  if (!isLinkToken(linkToken)) notFound();
  const { lang, e, c } = await searchParams; // POS P3.7 ▸ R8: c = chat tag (verified server-side in placePreorder) ◂
  const chatTag = typeof c === "string" && c.length > 0 && c.length <= 400 ? c : null; // POS P3.7 ▸ R8 ◂
  const locale = await qrLocale(lang);
  const t = qrT(locale);
  const text = { th: t("common.th"), en: t("common.en"), language: t("common.language") };
  const door = await linkDoor(linkToken, undefined, { ip: await posPublicClientIp() }); // POS P5.2 ▸ CD-P52-F3: per-IP read limit ◂
  if (!door.ok) {
    return (
      <QrPublicFrame testid="pos-qr-preorder-page" shop={null} sub="" locale={locale} text={text} data={{ state: "invalid" }}>
        <QrNoticeCard testid="pos-qr-invalid" title={t(door.messageKey)} body={t("common.invalidBody")} />
      </QrPublicFrame>
    );
  }
  const v = door.view;
  const notice = typeof e === "string" && /^qr\.[a-zA-Z.]+$/.test(e) ? e : null;
  return (
    <QrPublicFrame
      testid="pos-qr-preorder-page"
      shop={v.shop ?? { name: v.unit.name, logoUrl: null, branch: v.unit.name }}
      sub={t("preorder.sub", { branch: v.shop?.branch ?? v.unit.name })}
      locale={locale}
      text={text}
      wide
      data={{ state: "ok" }}
      footer={t("common.footer")}
    >
      <NextIntlClientProvider locale={locale} timeZone="Asia/Bangkok" messages={{ pos: { qr: MSGS[locale].qr } }}>
        <QrPreorderApp token={linkToken} locale={locale} view={v} notice={notice} actions={{ quote: quotePreorderCartAction, place: chatTag ? placeTaggedPreorderAction.bind(null, chatTag) : placePreorderAction }} />
      </NextIntlClientProvider>
    </QrPublicFrame>
  );
}
