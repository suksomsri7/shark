// components/book/BookFull.tsx — ก้อน "รอบนี้เต็มแล้ว" (ภาพ 07ก · RUN TRIPS W1.4a · ใบสั่ง ledger/trips-briefs/W1.4.md §4.1)
// ใช้ทั้งหน้าสินค้า (วันที่ขอเต็ม / ถือเกินที่ว่าง e=SOLD_OUT) และหน้าการจองที่หมดเวลา (รอบเดิมเต็ม)
// แสดงผลเท่านั้น: ทางเลือกทั้งหมดตัดสินใน platform (bookFullOf) · ทุกทางเลือกเป็นลิงก์ <a href> (ไม่ต้องมี JS · ไม่มีคอมโพเนนต์ฝั่งไคลเอนต์)
// ไม่มีราคา (มติ C-4) · ไม่มีปุ่มฝากชื่อรอ (W1.4c) · ร้านไม่มีเบอร์/LINE ⇒ ข้อความรูปไม่มีช่องทาง (มติ L8)
import { formatYmd } from "@/components/trips/trips-shared";
import type { BookFullVM, BookLocale } from "@/lib/platform/trips-public-core";
import { shopLang } from "./BookContent";
import { bookDateNames, bookT } from "./book-i18n";

const BOX = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] p-5";
const ITEM = "flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border px-4 py-2 text-base hover:border-[color:var(--color-accent)]";
const CHOOSE = "text-sm font-semibold text-[color:var(--color-accent)]";

export function BookFull({ full, locale }: { full: BookFullVM; locale: BookLocale }) {
  const t = bookT(locale);
  const names = bookDateNames(locale);
  const none = full.nearby.length === 0 && full.sameDay.length === 0;
  return (
    <section data-testid="book-full" role="status" className={BOX}>
      {/* ถือเกินที่ว่าง (ยังเหลือบางที่) ⇒ หัว "เหลือ n ต้องการ m" · เต็มจริง ⇒ "รอบนี้เต็มแล้ว" + จำนวนที่ต้องการ */}
      <h2 className="text-lg font-semibold">{full.left > 0 && full.want !== null ? t("full.short", { left: full.left, want: full.want }) : t("full.title")}</h2>
      {full.left === 0 && full.want !== null ? (
        <p data-testid="book-full-want" className="text-base">
          {t("full.want", { want: full.want, left: full.left })}
        </p>
      ) : null}

      {full.nearby.length ? (
        <div data-testid="book-full-nearby" className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("full.nearby")}</h3>
          <ul className="flex flex-col gap-2">
            {full.nearby.map((n) => (
              <li key={n.date} data-testid="book-full-nearby-item">
                <a href={n.href} className={ITEM}>
                  <span className="font-semibold">{formatYmd(n.date, names)}</span>
                  <span className="text-sm text-[color:var(--color-ink-soft)]">{t("full.left", { n: n.left })}</span>
                  <span className={CHOOSE}>{t("full.choose")}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {full.sameDay.length ? (
        <div data-testid="book-full-sameday" className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{t("full.sameDay")}</h3>
          <ul className="flex flex-col gap-2">
            {full.sameDay.map((s, i) => (
              <li key={i} data-testid="book-full-sameday-item">
                <a href={s.href} className={ITEM}>
                  <span lang={shopLang(s.title, locale)} className="min-w-0 break-words font-semibold">
                    {s.title.text}
                  </span>
                  <span className="text-sm text-[color:var(--color-ink-soft)]">{t("full.left", { n: s.left })}</span>
                  <span className={CHOOSE}>{t("full.choose")}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {none ? (
        <p data-testid="book-full-none" className="text-sm">
          {full.contact ? t("full.none", { contact: full.contact }) : t("full.noneNoContact")}
        </p>
      ) : null}
    </section>
  );
}
