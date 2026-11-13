// components/book/BookIndex.tsx — หน้ารายการสินค้าทัวร์ของร้าน `/book/[shop]` · RUN TRIPS W1.1a
// แสดงผลเท่านั้น: การ์ดต่อสินค้า (ชื่อ · สรุป · ลิงก์) — ไม่มีราคา/ที่ว่างบนการ์ด (ยังไม่มีบริการ "ราคาเริ่มต้น")
import { bookHref, type BookCarry, type BookShopVM } from "@/lib/platform/trips-public-core";
import { BookShell } from "./BookShell";
import { BookUntranslated, shopLang } from "./BookContent";
import { bookT } from "./book-i18n";

export function BookIndex({ vm, carry }: { vm: BookShopVM; carry: BookCarry }) {
  const t = bookT(vm.locale);
  const slug = vm.shop.slug;
  return (
    <BookShell
      brand={vm.shop}
      locale={vm.locale}
      homeHref={bookHref(slug, null, { lang: carry.lang, a: carry.a })}
      langHrefs={{ th: bookHref(slug, null, { lang: "th", a: carry.a }), en: bookHref(slug, null, { lang: "en", a: carry.a }) }}
    >
      <section data-testid="book-index">
        <h1 className="text-2xl font-semibold">{t("index.title")}</h1>
        {vm.products.length === 0 ? (
          <p data-testid="book-index-empty" className="mt-6 rounded-2xl border bg-[color:var(--color-surface)] px-4 py-8 text-center text-sm text-[color:var(--color-muted)]">
            {t("index.empty")}
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vm.products.map((p) => (
              <li key={p.slug} className="min-w-0">
                <a
                  data-testid={`book-card-${p.slug}`}
                  href={bookHref(slug, p.slug, { lang: carry.lang, a: carry.a })}
                  className="flex h-full min-h-11 flex-col gap-2 rounded-2xl border bg-[color:var(--color-surface)] p-5 hover:border-[color:var(--color-accent)]"
                >
                  <span lang={shopLang(p.title, vm.locale)} className="break-words text-lg font-semibold">
                    {p.title.text}
                  </span>
                  {p.title.fallback || (p.summary.text && p.summary.fallback) ? <BookUntranslated locale={vm.locale} /> : null}
                  {p.summary.text ? (
                    <span lang={shopLang(p.summary, vm.locale)} className="line-clamp-3 break-words text-sm text-[color:var(--color-ink-soft)]">
                      {p.summary.text}
                    </span>
                  ) : null}
                  <span className="mt-auto pt-2 text-sm font-medium text-[color:var(--color-accent)]">{t("index.view")}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {vm.truncated ? <p className="mt-4 text-sm text-[color:var(--color-muted)]">{t("index.truncated", { shown: vm.shown, total: vm.total })}</p> : null}
      </section>
    </BookShell>
  );
}
