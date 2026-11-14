// components/book/BookShell.tsx — เปลือกของหน้าจองสาธารณะ (หัวร้าน + ตราสินค้า + สลับภาษา) · RUN TRIPS W1.1a
// แสดงผลเท่านั้น · สีตราสินค้าผ่าน publicThemeStyle (ห้ามประกอบตัวแปรสีเอง) · lang ของหน้าอยู่ที่กล่องนอกสุด (html lang มาจากคุกกี้ของแอป)
import type { ReactNode } from "react";
import { publicThemeStyle } from "@/lib/branding/public";
import type { BookBrandVM, BookLocale } from "@/lib/platform/trips-public-core";
import { bookT } from "./book-i18n";

type Props = {
  brand: BookBrandVM;
  locale: BookLocale;
  /** ลิงก์หน้ารายการของร้าน (สร้างด้วย bookHref ที่ผู้เรียก) */
  homeHref: string;
  /** ลิงก์ของหน้าเดียวกันในแต่ละภาษา (คงพารามิเตอร์อื่น) */
  langHrefs: { th: string; en: string };
  /** เว้นท้ายหน้าเผื่อแถบล่างติดจอของมือถือ */
  bottomBar?: boolean;
  children: ReactNode;
};

const LANG_BASE = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-medium";
const LANG_ON = "bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)]";
const LANG_OFF = "border bg-[color:var(--color-surface)] text-[color:var(--color-ink)]";

export function BookShell({ brand, locale, homeHref, langHrefs, bottomBar, children }: Props) {
  const t = bookT(locale);
  const theme = publicThemeStyle({ displayName: brand.name, logoUrl: brand.logoUrl, brandColor: brand.brandColor, brandFg: brand.brandFg });
  return (
    <div data-testid="book-shell" lang={locale} style={theme} className={`min-h-screen bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)] ${bottomBar ? "pb-28 xl:pb-10" : "pb-10"}`}>
      <header className="border-b bg-[color:var(--color-surface)]">
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-3 px-4 py-3 lg:px-10">
          <a data-testid="book-brand" href={homeHref} title={t("shell.brandHome")} className="flex min-h-11 min-w-0 items-center gap-3">
            {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" /> : null}
            <span className="truncate text-base font-semibold">{brand.name}</span>
          </a>
          <nav aria-label={t("shell.langLabel")} className="flex shrink-0 items-center gap-2">
            <a data-testid="book-lang-th" href={langHrefs.th} lang="th" aria-current={locale === "th" ? "true" : undefined} className={`${LANG_BASE} ${locale === "th" ? LANG_ON : LANG_OFF}`}>
              {t("shell.langTh")}
            </a>
            <a data-testid="book-lang-en" href={langHrefs.en} lang="en" aria-current={locale === "en" ? "true" : undefined} className={`${LANG_BASE} ${locale === "en" ? LANG_ON : LANG_OFF}`}>
              {t("shell.langEn")}
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1360px] px-4 pt-5 lg:px-10 lg:pt-8">{children}</main>
    </div>
  );
}

/** กล่องข้อความเต็มหน้า (ไม่พบ / ถี่เกิน) — ไม่มีข้อมูลร้าน · สองภาษาในหน้าเดียว */
export function BookNoticeFrame({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="flex min-h-screen items-center justify-center bg-[color:var(--color-surface-2)] px-4 py-10 text-[color:var(--color-ink)]">
      <div className="w-full max-w-md rounded-2xl border bg-[color:var(--color-surface)] p-6">{children}</div>
    </div>
  );
}
