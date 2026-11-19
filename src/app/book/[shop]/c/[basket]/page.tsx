// /book/[shop]/c/[basket] — หน้ายืนยันการจอง (ผู้จอง + สรุป + ผู้ขาย + ยอมรับ) · RUN TRIPS W1.2a (ภาพ 01ค · 19)
// ทางเข้าเดียวคือ loadBookCheckout (กุญแจเครื่อง → ร้าน → ด่านอัตรา → token ตะกร้า + sel ที่เซ็นแล้ว → ราคาเทียบตอนถือ) · หน้าไม่ส่งเวลาเข้าไป
// 🔴 หน้านี้มี nonce + token ใน URL ⇒ dynamic (no-store) · ไม่ติดดัชนี · Referrer-Policy จากหัวของ proxy (strict-origin-when-cross-origin · path/query ไม่ออกนอกโดเมน · ไม่ใช้ metadata no-referrer เพราะฟอร์มปิด JS จะส่ง Origin: null แล้ว server action ล่ม · มติ W1.3 V1) · ชื่อหน้าทั่วไป (ไม่มีรหัส/สินค้า/วันที่ · มติ R14) · ไม่มี og:*
// ยืนยันไปแล้ว ⇒ ไปหน้าการจองเดิม · ไม่พบ ⇒ 404 รูปเดียว · ถี่เกิน ⇒ หน้าแจ้ง
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { BookCheckout, BookCheckoutStop } from "@/components/book/BookCheckout";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { bookT } from "@/components/book/book-i18n";
import { loadBookCheckout } from "@/lib/platform/trips-book";
import { bookCheckoutHref, bookErrorParam, bookRedirectOk, bookReservationHref } from "@/lib/platform/trips-book-core";
import { bookRequestFromHeaders } from "@/lib/platform/trips-public";
import { bookHref, bookLocaleOf, parseBookQuery } from "@/lib/platform/trips-public-core";
import { confirmBookHoldAction, reholdBookAction } from "../../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string; basket: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// โหลด 1 ครั้งต่อคำขอ (cache ของ React · อาร์กิวเมนต์ค่าพื้นฐาน)
const loadOnce = cache(async (shop: string, basket: string, sel: string | null, lang: string | null) => {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name));
  return loadBookCheckout({ shop, basketToken: basket, sel, lang, acceptLanguage: req.acceptLanguage, clientKey: req.clientKey });
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const sp = await props.searchParams;
  const h = await headers();
  const t = bookT(bookLocaleOf(parseBookQuery(sp).lang, h.get("accept-language")));
  return { title: t("page.titleCheckout"), robots: { index: false, follow: false } };
}

export default async function BookCheckoutPage(props: Props) {
  const { shop, basket } = await props.params;
  const sp = await props.searchParams;
  const sel = typeof sp.sel === "string" ? sp.sel : null;
  const lang = parseBookQuery(sp).lang;
  const r = await loadOnce(shop, basket, sel, lang);
  if (!r.ok) {
    // ยืนยันไปแล้ว ⇒ หน้าการจองเดิม — ค่าใน Location ผ่าน bookRedirectOk แบบเดียวกับ action (มติ Y7)
    if (r.code === "DONE" && bookRedirectOk({ shopSlug: r.shopSlug, token: r.token })) redirect(bookReservationHref(r.shopSlug ?? "", r.token ?? "", lang));
    if (r.code === "NOT_FOUND") notFound();
    if (r.code === "RATE_LIMITED") return <BookRateLimited />;
  }
  const h = await headers();
  const locale = r.ok ? r.vm.locale : bookLocaleOf(lang, h.get("accept-language"));
  const slug = r.ok ? r.vm.brand.slug : (r.shopSlug ?? null);
  const home = bookHref(slug ?? shop, null, { lang });
  const langHref = (l: "th" | "en") => (slug && sel ? bookCheckoutHref(slug, basket, sel, null, l) : bookHref(slug ?? shop, null, { lang: l }));
  const frame = {
    locale,
    homeHref: home,
    langHrefs: { th: langHref("th"), en: langHref("en") },
    brand: r.ok ? r.vm.brand : { slug: slug ?? "", name: "", logoUrl: null, brandColor: null, brandFg: null },
  };
  if (!r.ok) {
    // ถือใหม่ = ฟอร์ม POST (ปล่อยที่ถือของตะกร้านี้ก่อน · มติ W2) — มีเมื่อ platform คืน rehold (ตะกร้า/sel ตรวจลายเซ็นแล้ว)
    const rehold = r.rehold && sel ? reholdBookAction.bind(null, shop, basket, sel) : null;
    return <BookCheckoutStop code={r.code} frame={frame} rehold={rehold} heldTotalSatang={r.heldTotalSatang ?? null} totalSatang={r.totalSatang ?? null} />;
  }
  return <BookCheckout vm={r.vm} frame={frame} action={confirmBookHoldAction.bind(null, shop, basket, sel)} error={bookErrorParam(sp)} />;
}
