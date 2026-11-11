// /q/t/<qrToken> — table QR on the POS door (POS P2.7 S doors · P2.7U page · ruling 1 6 11 15 · CD7).
// Public: no session, noindex, force-dynamic. Reading never opens a table session (the legacy page did on every view/poll).
// Server part: token shape -> notFound() · tableDoor (+ tableBill when the table has a session) · frame with the receipt header source.
// Client island (components/pos/qr/QrTableApp): menu · cart (server quote) · send round · rounds + kitchen status · call staff / bill · PromptPay + notify,
// polling tablePoll with sinceVer (0 writes) and pausing on hidden tabs. No locale-dependent date/number output in SSR (times are ISO strings).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import thPos from "@/messages/th/pos.json";
import enPos from "@/messages/en/pos.json";
import { tableBill, tableDoor } from "@/lib/modules/pos/qr-order";
import { isTableQrToken } from "@/lib/modules/pos/qr-order-shared";
import { posPublicClientIp } from "@/lib/modules/pos/public-rate"; // POS P5.2 ▸ CD-P52-F3 ◂
import { QrNoticeCard, QrPublicFrame } from "@/components/pos/qr/QrPublicFrame";
import { QrTableApp } from "@/components/pos/qr/QrTableApp";
import { placeTableRoundAction, quoteTableCartAction, tableBillAction, tableNotifyPaidAction, tablePollAction, tableServiceRequestAction } from "../../actions";
import { qrLocale, qrT } from "../../qr-i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
const MSGS = { th: thPos, en: enPos } as const;

export default async function QrTablePage({ params, searchParams }: { params: Promise<{ qrToken: string }>; searchParams: Promise<{ lang?: string; e?: string }> }) {
  const { qrToken } = await params;
  if (!isTableQrToken(qrToken)) notFound();
  const { lang, e } = await searchParams;
  const locale = await qrLocale(lang);
  const t = qrT(locale);
  const text = { th: t("common.th"), en: t("common.en"), language: t("common.language") };
  const ip = await posPublicClientIp(); // POS P5.2 ▸ CD-P52-F3: per-IP read limit ◂
  const door = await tableDoor(qrToken, { ip });
  if (!door.ok) {
    return (
      <QrPublicFrame testid="pos-qr-table-page" shop={null} sub="" locale={locale} text={text} data={{ state: "invalid" }}>
        <QrNoticeCard testid="pos-qr-invalid" title={t(door.messageKey)} body={t("common.invalidBody")} />
      </QrPublicFrame>
    );
  }
  const v = door.view;
  const billRes = v.session ? await tableBill(qrToken, { ip }) : null; // POS P5.2 ▸ CD-P52-F3 ◂
  const notice = typeof e === "string" && /^qr\.[a-zA-Z.]+$/.test(e) ? e : null;
  return (
    <QrPublicFrame
      testid="pos-qr-table-page"
      shop={v.shop ?? { name: v.unit.name, logoUrl: null, branch: v.unit.name }}
      sub={v.shop?.branch ?? v.unit.name}
      locale={locale}
      text={text}
      wide
      data={{ state: "ok" }}
      badge={
        <span data-testid="pos-qr-table-name" className="shrink-0 rounded-[10px] border-2 border-[color:var(--color-ink)] px-2.5 py-1 text-[14px] font-bold">
          {t("table.title", { table: v.table.name })}
        </span>
      }
      footer={t("common.footer")}
    >
      <NextIntlClientProvider locale={locale} timeZone="Asia/Bangkok" messages={{ pos: { qr: MSGS[locale].qr } }}>
        <QrTableApp
          token={qrToken}
          locale={locale}
          initial={v}
          initialBill={billRes && billRes.ok ? billRes.bill : null}
          notice={notice}
          actions={{ poll: tablePollAction, quote: quoteTableCartAction, place: placeTableRoundAction, request: tableServiceRequestAction, notifyPaid: tableNotifyPaidAction, bill: tableBillAction }}
        />
      </NextIntlClientProvider>
    </QrPublicFrame>
  );
}
