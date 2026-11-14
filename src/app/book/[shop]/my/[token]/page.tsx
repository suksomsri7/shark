// /book/[shop]/my/[token] — หน้าการจองของลูกค้า (จ่าย QR ยอดล็อก · วอเชอร์ · สิ่งที่ต้องทำ · หมดเวลา) · RUN TRIPS W1.2a (ภาพ 01ง · 07)
// ทางเข้าเดียวคือ openBookReservation (กุญแจเครื่อง → ร้าน → ด่านอัตรา + ถังเดา token → การจองจาก sha256(token) ผูกร้านใน URL) · หน้าไม่ส่งเวลาเข้าไป
// 🔴 token อยู่ใน URL ⇒ dynamic (no-store) · ไม่ติดดัชนี · no-referrer · ชื่อหน้าทั่วไป (ไม่มีรหัส/สินค้า/วันที่ · มติ R14) · ไม่มี og:*
// ไม่พบ/ร้านอื่น ⇒ 404 รูปเดียว · ถี่เกิน ⇒ หน้าแจ้ง
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookError } from "@/components/book/BookFlowParts";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { BookReservation } from "@/components/book/BookReservation";
import { BookNoticeFrame } from "@/components/book/BookShell";
import { bookT } from "@/components/book/book-i18n";
import { openBookReservation } from "@/lib/platform/trips-book";
import { bookReservationHref } from "@/lib/platform/trips-book-core";
import { bookRequestFromHeaders } from "@/lib/platform/trips-public";
import { bookHref, bookLocaleOf, parseBookQuery } from "@/lib/platform/trips-public-core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string; token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// เปิด 1 ครั้งต่อคำขอ (cache ของ React · อาร์กิวเมนต์ค่าพื้นฐาน)
const openOnce = cache(async (shop: string, token: string, lang: string | null) => {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name));
  return openBookReservation({ shop, token, lang, acceptLanguage: req.acceptLanguage, clientKey: req.clientKey });
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const sp = await props.searchParams;
  const h = await headers();
  const t = bookT(bookLocaleOf(parseBookQuery(sp).lang, h.get("accept-language")));
  return { title: t("page.titleReservation"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function BookReservationPage(props: Props) {
  const { shop, token } = await props.params;
  const lang = parseBookQuery(await props.searchParams).lang;
  const r = await openOnce(shop, token, lang);
  if (!r.ok) {
    if (r.code === "NOT_FOUND") notFound();
    if (r.code === "RATE_LIMITED") return <BookRateLimited />;
    const h = await headers();
    const locale = bookLocaleOf(lang, h.get("accept-language"));
    // รอร้านยืนยัน (PENDING · AWAIT_SHOP = W1.2b) มีข้อความของตัวเอง (มติ W5) — ไม่ใช่ "ยังจองออนไลน์ไม่ได้"
    if (r.code === "UNAVAILABLE" && r.reason === "PENDING") {
      return (
        <BookNoticeFrame testId="book-res-pending">
          <p role="status" className="text-base">
            {bookT(locale)("res.pending")}
          </p>
        </BookNoticeFrame>
      );
    }
    return (
      <BookNoticeFrame testId="book-res-unavailable">
        <BookError code={r.code} locale={locale} />
      </BookNoticeFrame>
    );
  }
  const slug = r.vm.brand.slug;
  return (
    <BookReservation
      vm={r.vm}
      frame={{ locale: r.vm.locale, homeHref: bookHref(slug, null, { lang }), langHrefs: { th: bookReservationHref(slug, token, "th"), en: bookReservationHref(slug, token, "en") } }}
    />
  );
}
