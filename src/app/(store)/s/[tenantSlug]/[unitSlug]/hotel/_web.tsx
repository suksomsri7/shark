// SVC H.8 ▸ ส่วนร่วมของหน้าจองโรงแรมสาธารณะ (หัวหน้า · ภาษา · ลิงก์) — server component ล้วน
import Link from "next/link";
import type { ReactNode } from "react";
import type { WebLocale } from "@/components/store/hotel/format";

export type PageSearch = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

/** querystring ที่คงภาษา (เมื่อเปิดด้วย ?lang=) */
export function withLang(href: string, lang: string | null): string {
  if (!lang) return href;
  return `${href}${href.includes("?") ? "&" : "?"}lang=${lang}`;
}

/** หัวหน้า (ภาพ 16): ไอคอนกุญแจ · ชื่อโรงแรม · ป้าย/คำรอง · สลับภาษา TH|EN (ลิงก์ ?lang=) */
export function WebHeader(props: { unitName: string; sub: string | null; locale: WebLocale; langHref: (l: WebLocale) => string; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-[color:var(--color-line)] px-4 pb-2.5 pt-1.5 text-[13px] text-[color:var(--color-muted)]">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <b className="text-[color:var(--color-ink)]">{props.unitName}</b>
      {props.sub ? <span className="truncate">· {props.sub}</span> : null}
      <span className="flex-1" />
      {props.right}
      <span className="flex items-center gap-1.5 text-xs">
        <Link href={props.langHref("th")} className={props.locale === "th" ? "font-semibold text-[color:var(--color-ink)]" : ""}>
          TH
        </Link>
        <span>|</span>
        <Link href={props.langHref("en")} className={props.locale === "en" ? "font-semibold text-[color:var(--color-ink)]" : ""}>
          EN
        </Link>
      </span>
    </header>
  );
}

export function WebShell(props: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-8">{props.children}</main>;
}

export function WebNotFound(props: { title: string; desc: string; href?: string; cta?: string }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-16 text-center">
      <div className="text-lg font-semibold">{props.title}</div>
      <p className="mt-2 text-sm text-[color:var(--color-muted)]">{props.desc}</p>
      {props.href && props.cta ? (
        <Link href={props.href} className="btn btn-primary mt-6 inline-flex min-h-[44px] items-center px-5">
          {props.cta}
        </Link>
      ) : null}
    </main>
  );
}
