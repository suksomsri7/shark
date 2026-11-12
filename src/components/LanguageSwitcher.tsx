"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

// สลับภาษา TH | EN — ตั้ง cookie "lang" (path=/, 1 ปี) แล้ว refresh ให้ server re-render
// ตัว active = font-semibold ink · อีกตัว = muted
// hrefs (ไม่บังคับ · SVC rel-fix): หน้าที่ส่งภาษาทาง ?lang= ด้วย (หน้าจองโรงแรม) — ตั้ง cookie แล้วไปยังลิงก์ของภาษานั้นแทน refresh
export function LanguageSwitcher({ locale, hrefs }: { locale: Locale; hrefs?: { th: string; en: string } }) {
  const router = useRouter();

  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    if (hrefs) router.push(hrefs[next], { scroll: false });
    else router.refresh();
  }

  const cls = (active: boolean) =>
    active
      ? "font-semibold text-[color:var(--color-ink)]"
      : "text-[color:var(--color-muted)]";

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <button type="button" onClick={() => choose("th")} className={cls(locale === "th")}>
        TH
      </button>
      <span className="text-[color:var(--color-line)]">|</span>
      <button type="button" onClick={() => choose("en")} className={cls(locale === "en")}>
        EN
      </button>
    </div>
  );
}
