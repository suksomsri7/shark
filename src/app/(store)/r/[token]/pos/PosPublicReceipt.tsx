// PosPublicReceipt.tsx — หน้าใบเสร็จออนไลน์ POS ที่ /r/<token> (P1.11U · ภาพ 11C · มือถือ 390 เป็นหลัก)
//
// 🔴 Server Component — ข้อมูลมาจาก publicReceipt(token) ที่หน้า dispatcher เรียกเท่านั้น (CD1) · ไม่อ่าน session · ไม่มี id ภายในบนหน้า
// 🔴 ไม่มีข้อมูลส่วนตัว (R2 · R9): ชื่อร้าน/สาขา/รายการ/ยอด/วิธีจ่าย/แต้ม เท่านั้น — ไม่มีชื่อ/เบอร์/อีเมลสมาชิก ไม่มีแคชเชียร์ ไม่มีรหัสเครื่อง
// 🔴 ข้อความทุกคำมาจาก pos.receipt.* (th ค่าปริยาย · ?lang=en) — โหลด messages ของภาษาที่ขอเอง (ไม่พึ่งคุกกี้ LOCALE ของแอป)
// ปุ่ม 4 ปุ่ม + แผ่นฟอร์ม = PosReceiptActions (client) · ห่อ NextIntlClientProvider ของภาษาที่หน้าเลือก (ส่งเฉพาะ pos.receipt)

import { createTranslator, NextIntlClientProvider } from "next-intl";
import thPos from "@/messages/th/pos.json";
import enPos from "@/messages/en/pos.json";
import type { PublicReceipt } from "@/lib/modules/pos/receipt-public-shared";
import { PosReceiptActions } from "./PosReceiptActions";

export type PosReceiptLocale = "th" | "en";
type T = (key: string, values?: Record<string, string | number>) => string;

const MSGS = { th: thPos, en: enPos } as const;

/** ตัวแปลของ pos.receipt ตามภาษาที่หน้าเลือก */
export function posReceiptT(locale: PosReceiptLocale): T {
  return createTranslator({ locale, messages: { pos: MSGS[locale] }, namespace: "pos.receipt" } as never) as unknown as T;
}

/** สตางค์ → "฿1,234" (ไม่มีเศษ) / "฿40.89" · ติดลบใช้เครื่องหมายลบยาวตามภาพ */
export function receiptBaht(satang: number): string {
  const n = Number.isFinite(satang) ? Math.trunc(satang) : 0;
  const a = Math.abs(n);
  const whole = Math.floor(a / 100).toLocaleString("en-US");
  const frac = a % 100;
  return `${n < 0 ? "−" : ""}฿${whole}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
}

/** วันเวลาไทย: th "30 ก.ย. 2569 09:41" · en "30 Sep 2026 09:41" (เขตเวลาไทยเสมอ) */
function paidAtText(iso: string, locale: PosReceiptLocale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const loc = locale === "en" ? "en-GB" : "th-TH";
  const day = new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(d);
  return `${day} ${time}`;
}

const vatRate = (bp: number) => (bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2));
const PAY_KEYS = new Set(["CASH", "TRANSFER", "PROMPTPAY", "DEPOSIT", "ROOM_CHARGE", "CARD"]);

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** ภาษา: ลิงก์ ?lang= (หน้าไม่มีคุกกี้/ล็อกอิน · ลิงก์ที่แชร์ต่อคงภาษาเดิม) */
function LangLinks({ locale, t }: { locale: PosReceiptLocale; t: T }) {
  const cls = (on: boolean) => `inline-flex min-h-[44px] items-center px-2 ${on ? "font-semibold text-[color:var(--color-ink)]" : "text-[color:var(--color-muted)]"}`;
  return (
    <nav className="flex items-center justify-center text-[12px]" aria-label="language">
      <a href="?lang=th" data-testid="pos-rpub-lang-th" hrefLang="th" aria-current={locale === "th" ? "true" : undefined} className={cls(locale === "th")}>
        {t("public.lang.th")}
      </a>
      <span className="text-[color:var(--color-line)]" aria-hidden="true">
        |
      </span>
      <a href="?lang=en" data-testid="pos-rpub-lang-en" hrefLang="en" aria-current={locale === "en" ? "true" : undefined} className={cls(locale === "en")}>
        {t("public.lang.en")}
      </a>
    </nav>
  );
}

/** กรอบหน้า: มือถือเต็มจอ · จอกว้าง = คอลัมน์ 440 กลางจอ */
function Shell({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <div className="flex min-h-screen w-full justify-center bg-[color:var(--color-surface-2)]">
      <main data-testid={testid} className="flex min-h-screen w-full max-w-[440px] flex-col bg-[color:var(--color-surface)] px-5 pt-3 text-[color:var(--color-ink)]">
        {children}
      </main>
    </div>
  );
}

export function PosPublicReceipt({ token, receipt: r, locale }: { token: string; receipt: PublicReceipt; locale: PosReceiptLocale }) {
  const t = posReceiptT(locale);
  const name = r.shop.name || t("public.title");
  const initial = Array.from(name.trim())[0] ?? "S";
  const sub = [r.shop.branchLabel, paidAtText(r.paidAt, locale)].filter(Boolean).join(" · ");
  const bad = r.status !== "PAID";
  const chipText = r.status === "REFUNDED_PARTIAL" ? t("public.status.REFUNDED_PARTIAL", { amount: receiptBaht(r.refundedSatang) }) : t(`public.status.${r.status}`);
  const payText = r.payments
    .filter((p) => p.satang !== 0)
    .map((p) => `${t(`public.pay.${PAY_KEYS.has(p.method) ? p.method : "OTHER"}`)} ${receiptBaht(p.satang)}`)
    .join(" · ");
  const row = "flex justify-between gap-3 py-[3px] text-[color:var(--color-ink-soft)] tabular-nums";
  return (
    <Shell testid="pos-rpub-root">
      {/* หัว: โลโก้ (ตัวอักษรแรก) · ชื่อร้าน · สาขา · วันเวลา · ชิปสถานะ */}
      <header className="flex items-center gap-[14px] pb-3 pt-2.5">
        {r.shop.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.shop.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-[11px] object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]">
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold">{name}</h1>
          <p className="truncate text-[12px] text-[color:var(--color-muted)]">{sub}</p>
        </div>
        <span
          data-testid="pos-rpub-status"
          data-status={r.status}
          className={`inline-flex h-7 shrink-0 items-center gap-[5px] rounded-[8px] border px-[11px] text-[13px] font-bold ${bad ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : "border-[color:var(--color-ink)] text-[color:var(--color-ink)]"}`}
        >
          {r.status === "PAID" ? <CheckIcon /> : null}
          {chipText}
        </span>
      </header>

      {/* การ์ดสรุปบิล */}
      <section className="rounded-[12px] border px-[14px] py-3 text-[13px]" aria-label={t("public.title")}>
        <p data-testid="pos-rpub-receipt-no" className="text-[11.5px] text-[color:var(--color-muted)]">
          {[t("public.receiptNo", { no: r.receiptNo }), r.abbNo ? t("public.abbNo", { no: r.abbNo }) : null].filter(Boolean).join(" · ")}
        </p>
        <div className="my-[7px] h-px bg-[color:var(--color-line)]" />
        <ul>
          {r.lines.map((l, i) => (
            <li key={i} data-testid="pos-rpub-line" className={row}>
              <span className="min-w-0 break-words">
                {l.name}
                {l.qty !== 1 ? ` × ${l.qty}${l.unit ? ` ${l.unit}` : ""}` : ""}
                {l.options && l.options.length ? <span className="block text-[11.5px] text-[color:var(--color-muted)]">{l.options.join(" · ")}</span> : null}
              </span>
              <span className="shrink-0">{receiptBaht(l.lineTotalSatang)}</span>
            </li>
          ))}
        </ul>
        <div className="my-[7px] h-px bg-[color:var(--color-line)]" />
        {r.discountSatang > 0 ? (
          <div className={row} data-testid="pos-rpub-discount">
            <span>{t("public.discount")}</span>
            <span className="text-[color:var(--color-danger)]">{receiptBaht(-r.discountSatang)}</span>
          </div>
        ) : null}
        {r.serviceChargeSatang > 0 ? (
          <div className={row}>
            <span>{t("public.serviceCharge")}</span>
            <span>{receiptBaht(r.serviceChargeSatang)}</span>
          </div>
        ) : null}
        {r.vat ? (
          <div className={row} data-testid="pos-rpub-vat">
            <span>{t("public.vatIncluded", { rate: vatRate(r.vat.rateBp) })}</span>
            <span>{receiptBaht(r.vat.satang)}</span>
          </div>
        ) : null}
        <div data-testid="pos-rpub-net" className="flex justify-between gap-3 pt-1.5 text-[18px] font-bold tabular-nums">
          <span>{t("public.net")}</span>
          <span>{receiptBaht(r.grandTotalSatang)}</span>
        </div>
        {r.tipSatang > 0 ? (
          <div className={row}>
            <span>{t("public.tip")}</span>
            <span>{receiptBaht(r.tipSatang)}</span>
          </div>
        ) : null}
        {r.refundedSatang > 0 ? (
          <div className={row} data-testid="pos-rpub-refunded">
            <span>{t("public.refunded")}</span>
            <span className="text-[color:var(--color-danger)]">{receiptBaht(-r.refundedSatang)}</span>
          </div>
        ) : null}
        {payText ? (
          <p data-testid="pos-rpub-payments" className="mt-0.5 text-[11.5px] text-[color:var(--color-muted)]">
            {payText}
          </p>
        ) : null}
      </section>

      <NextIntlClientProvider locale={locale} timeZone="Asia/Bangkok" messages={{ pos: { receipt: MSGS[locale].receipt } }}>
        <PosReceiptActions token={token} actions={r.actions} points={r.points} />
      </NextIntlClientProvider>

      <footer className="mt-auto flex flex-col items-center gap-1 pb-[18px] pt-8 text-center text-[11.5px] text-[color:var(--color-muted)]">
        <p>{t("public.footer")}</p>
        <LangLinks locale={locale} t={t} />
      </footer>
    </Shell>
  );
}

/** ระบบขัดข้อง (INTERNAL) — ไม่ใช่ 404 */
export function PosReceiptUnavailable({ locale }: { locale: PosReceiptLocale }) {
  const t = posReceiptT(locale);
  return (
    <Shell testid="pos-rpub-unavailable">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-xl font-semibold">{t("public.unavailable.title")}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">{t("public.unavailable.desc")}</p>
      </div>
      <footer className="pb-[18px]">
        <LangLinks locale={locale} t={t} />
      </footer>
    </Shell>
  );
}

/** ไม่พบใบเสร็จ (TOKEN_NOT_FOUND → notFound() → not-found.tsx ของเส้นทางนี้ · HTTP 404) */
export function PosReceiptNotFound({ locale }: { locale: PosReceiptLocale }) {
  const t = posReceiptT(locale);
  return (
    <Shell testid="pos-rpub-not-found">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-xl font-semibold">{t("public.notFound.title")}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">{t("public.notFound.desc")}</p>
      </div>
      <footer className="pb-[18px] text-center text-[11.5px] text-[color:var(--color-muted)]">{t("public.footer")}</footer>
    </Shell>
  );
}
