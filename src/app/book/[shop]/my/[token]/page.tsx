// /book/[shop]/my/[token] — หน้าการจองของลูกค้า (จ่าย QR ยอดล็อก · วอเชอร์ · สิ่งที่ต้องทำ · หมดเวลา) · RUN TRIPS W1.2a (ภาพ 01ง · 07)
// ทางเข้าเดียวคือ openBookReservation (กุญแจเครื่อง → ร้าน → ด่านอัตรา + ถังเดา token → การจองจาก sha256(token) ผูกร้านใน URL) · หน้าไม่ส่งเวลาเข้าไป
// 🔴 token อยู่ใน URL ⇒ dynamic (no-store) · ไม่ติดดัชนี · no-referrer · ชื่อหน้าทั่วไป (ไม่มีรหัส/สินค้า/วันที่ · มติ R14) · ไม่มี og:*
// ไม่พบ/ร้านอื่น ⇒ 404 รูปเดียว · ถี่เกิน ⇒ หน้าแจ้ง
// TRIPS W1.3a ▸ การจองของฉัน: ก้อนจัดการ (vm.manage) · `?do=cancel` = ยืนยันเบอร์ผู้จอง (ไม่มี grant) / หน้ายกเลิก (มี `g` ที่ตรวจรูปแล้ว · grant 15 นาที ผูกเครื่อง · K7)
//   ยอดคืนจาก quoteBookSelfCancel (snapshot) · ฟอร์ม POST ไป actions ของ my/ (ไม่ต้องมี JS) · `?done` แสดงเมื่อสภาพจริงตรงเท่านั้น ◂
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookError, bookContactText } from "@/components/book/BookFlowParts";
import { BookRateLimited } from "@/components/book/BookRateLimited";
import { BookReservation } from "@/components/book/BookReservation";
import { BookSelfCancel, BookSelfError, BookSelfLocked, BookSelfManage, BookSelfVerify } from "@/components/book/BookSelf";
import { BookNoticeFrame } from "@/components/book/BookShell";
import { bookT } from "@/components/book/book-i18n";
import { openBookReservation } from "@/lib/platform/trips-book";
import { bookReservationHref } from "@/lib/platform/trips-book-core";
import { bookRequestFromHeaders } from "@/lib/platform/trips-public";
import { quoteBookSelfCancel } from "@/lib/platform/trips-self";
import { selfPageErrorOf, selfPageParams, selfReservationHref, selfShowsManage, type SelfPageError } from "@/lib/platform/trips-self-core";
import { cancelSelfAction, verifySelfAction } from "../actions";
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
  return { title: t(selfPageParams(sp).act ? "page.titleManage" : "page.titleReservation"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function BookReservationPage(props: Props) {
  const { shop, token } = await props.params;
  const sp = await props.searchParams;
  const lang = parseBookQuery(sp).lang;
  const self = selfPageParams(sp);
  const r = await openOnce(shop, token, lang);
  if (!r.ok) {
    if (r.code === "NOT_FOUND") notFound();
    if (r.code === "RATE_LIMITED") return <BookRateLimited />;
    const h = await headers();
    const locale = bookLocaleOf(lang, h.get("accept-language"));
    // รอร้านยืนยัน (PENDING · AWAIT_SHOP = W1.2b) มีข้อความของตัวเอง (มติ W5) — ไม่ใช่ "ยังจองออนไลน์ไม่ได้"
    // แสดงรหัสการจอง + ทางติดต่อร้าน · ไม่สัญญาว่าร้านจะติดต่อ (มติ Y6)
    if (r.code === "UNAVAILABLE" && r.reason === "PENDING" && r.pending) {
      const t = bookT(locale);
      return (
        <BookNoticeFrame testId="book-res-pending">
          <p data-testid="book-res-code" className="text-xl font-semibold">
            {t("res.code", { code: r.pending.bookingCode })}
          </p>
          <p role="status" className="text-base">
            {t("res.pending", { contact: bookContactText(r.pending.shop), code: r.pending.bookingCode })}
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
  const vm = r.vm;
  const top = self.act === "cancel" && vm.manage.cancel !== null ? await selfPanel(shop, token, self, vm) : null;
  return (
    <BookReservation
      vm={vm}
      frame={{ locale: vm.locale, homeHref: bookHref(slug, null, { lang }), langHrefs: { th: bookReservationHref(slug, token, "th"), en: bookReservationHref(slug, token, "en") } }}
      selfTop={top}
      selfManage={
        top ? null : (
          <BookSelfManage manage={vm.manage} shop={vm.shop} code={vm.code} locale={vm.locale} cancelHref={selfReservationHref(slug, token, lang, { act: "cancel" })} done={self.done} state={vm.state} />
        )
      }
    />
  );
}

type Vm = Extract<Awaited<ReturnType<typeof openBookReservation>>, { ok: true }>["vm"];
/** `?do=cancel`: มี grant ⇒ หน้ายกเลิก (ยอดจากบริการ) · ไม่มี/หมด/เครื่องอื่น ⇒ ฟอร์มยืนยันเบอร์ · ถูกล็อก ⇒ ติดต่อร้าน · ปุ่มปิดแล้ว ⇒ ก้อนจัดการ */
async function selfPanel(shop: string, token: string, self: ReturnType<typeof selfPageParams>, vm: Vm) {
  const h = await headers();
  const req = bookRequestFromHeaders((name) => h.get(name));
  if (self.error === "LOCKED") return <BookSelfLocked shop={vm.shop} code={vm.code} locale={vm.locale} />;
  let error: SelfPageError | null = self.error;
  if (self.grant) {
    const q = await quoteBookSelfCancel({ shop, token, grant: self.grant, clientKey: req.clientKey });
    if (q.ok) return <BookSelfCancel vm={q.vm} action={cancelSelfAction.bind(null, shop, token, self.grant)} shop={vm.shop} code={vm.code} locale={vm.locale} error={error} />;
    if (selfShowsManage(q.code)) return null;
    const qe = selfPageErrorOf(q);
    if (q.code !== "VERIFY_REQUIRED") return qe ? <BookSelfError code={qe} locale={vm.locale} /> : null;
    error = error ?? "VERIFY_REQUIRED";
  }
  // nonce ของฟอร์มยืนยันมาจากตัวเปิดหน้า (มติ L6 · หน้าไม่แก้ร้านเอง)
  const nonce = vm.selfVerifyNonce;
  if (!nonce) return <BookSelfError code="UNAVAILABLE" locale={vm.locale} />;
  return <BookSelfVerify action={verifySelfAction.bind(null, shop, token)} nonce={nonce} locale={vm.locale} error={error} />;
}
