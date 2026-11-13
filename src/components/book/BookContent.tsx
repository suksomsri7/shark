// components/book/BookContent.tsx — เนื้อหาที่ร้านเขียน (กำหนดการ · สิ่งที่รวม · จุดนัดพบ) + ป้าย "ยังไม่แปล" · RUN TRIPS W1.1a
// ข้อความของร้านแสดงเป็นข้อความธรรมดา (เว้นบรรทัดตามต้นฉบับ) — ไม่แปลงเป็น HTML
import type { BookLocale, BookText } from "@/lib/platform/trips-public-core";
import { bookT } from "./book-i18n";

/** ป้าย "ร้านยังไม่ได้แปล — แสดงเป็นภาษาไทย" (เส้นประ + เครื่องหมาย) */
export function BookUntranslated({ locale }: { locale: BookLocale }) {
  const t = bookT(locale);
  return (
    <span data-testid="book-untranslated" className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-dashed border-[color:var(--color-muted)] px-2.5 py-1 text-sm text-[color:var(--color-ink-soft)]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75v4M8 11.1v.15" strokeLinecap="round" />
      </svg>
      <span className="min-w-0 break-words">{t("product.untranslated")}</span>
    </span>
  );
}

/** ส่วนเนื้อหา 1 ส่วน — ไม่มีข้อความ ⇒ ไม่แสดง · ส่วนที่ยังไม่แปล ⇒ ข้อความไทย (กำกับ lang) + ป้าย */
export function BookSection({ testId, title, value, locale }: { testId: string; title: string; value: BookText; locale: BookLocale }) {
  if (!value.text) return null;
  return (
    <section data-testid={testId} className="rounded-2xl border bg-[color:var(--color-surface)] p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {value.fallback ? <BookUntranslated locale={locale} /> : null}
      </div>
      <p lang={value.fallback ? "th" : locale} className="mt-3 whitespace-pre-line break-words text-base leading-relaxed text-[color:var(--color-ink-soft)]">
        {value.text}
      </p>
    </section>
  );
}
