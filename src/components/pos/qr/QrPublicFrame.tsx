// QrPublicFrame.tsx — กรอบหน้าสาธารณะ QR (/q/** · POS P2.7U · มติ 15: ภาษาภาพเดียวกับใบเสร็จออนไลน์ /r/<token>)
//   คอลัมน์เดียวกลางจอ (มือถือ 390 เต็มจอ · จอกว้างถึง 1024 = คอลัมน์ wide ตามผู้เรียก) · หัว = แหล่งหัวใบเสร็จ (โลโก้/ตัวอักษรแรก · ชื่อร้าน · บรรทัดรอง)
//   ลิงก์ภาษา ?lang=th|en (หน้าไม่มีคุกกี้/ล็อกอิน · ลิงก์ที่แชร์ต่อคงภาษาเดิม) · ใช้ได้ทั้ง server และ client (ไม่มี hook)
//   🔴 ไม่มีข้อความไทยในไฟล์ (ST7) — ข้อความทุกคำมาจากผู้เรียก (pos.qr.*)

import type { ReactNode } from "react";
import type { QrShopHeader } from "@/lib/modules/pos/qr-order-shared";

export type QrFrameText = { th: string; en: string; language: string };

// POS P2.7U fix1 ▸ nit (a): ลิงก์ภาษา ≥ 44×44 ◂
export function QrLangLinks({ locale, text }: { locale: "th" | "en"; text: QrFrameText }) {
  const cls = (on: boolean) => `inline-flex min-h-11 min-w-11 items-center justify-center px-2 ${on ? "font-semibold text-[color:var(--color-ink)]" : "text-[color:var(--color-muted)]"}`;
  return (
    <nav className="flex items-center text-[12.5px]" aria-label={text.language}>
      <a href="?lang=th" hrefLang="th" data-testid="pos-qr-lang-th" aria-current={locale === "th" ? "true" : undefined} className={cls(locale === "th")}>
        {text.th}
      </a>
      <span className="text-[color:var(--color-line)]" aria-hidden="true">
        |
      </span>
      <a href="?lang=en" hrefLang="en" data-testid="pos-qr-lang-en" aria-current={locale === "en" ? "true" : undefined} className={cls(locale === "en")}>
        {text.en}
      </a>
    </nav>
  );
}

export function QrPublicFrame(p: {
  testid: string;
  shop: QrShopHeader | null;
  /** บรรทัดรองใต้ชื่อร้าน (สาขา · โต๊ะ) */
  sub: string;
  locale: "th" | "en";
  text: QrFrameText;
  /** ป้ายมุมขวาของหัว (เช่น "โต๊ะ B2") */
  badge?: ReactNode;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  data?: Record<string, string>;
}) {
  const name = p.shop?.name || "";
  const initial = Array.from(name.trim())[0] ?? "S";
  return (
    <div className="flex min-h-screen w-full justify-center bg-[color:var(--color-surface-2)]">
      <div
        data-testid={p.testid}
        {...Object.fromEntries(Object.entries(p.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
        className={`flex min-h-screen w-full flex-col bg-[color:var(--color-surface)] text-[color:var(--color-ink)] ${p.wide ? "max-w-[1024px]" : "max-w-[480px]"}`}
      >
        <header className="flex items-center gap-3 border-b px-4 pb-3 pt-3 md:px-6">
          {p.shop?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.shop.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-[11px] object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 data-testid="pos-qr-shop" className="truncate text-[15px] font-bold">
              {name}
            </h1>
            <p className="truncate text-[12px] text-[color:var(--color-muted)]">{p.sub}</p>
          </div>
          {p.badge ?? null}
          <QrLangLinks locale={p.locale} text={p.text} />
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{p.children}</main>
        {p.footer ? <footer className="px-4 pb-6 pt-6 text-center text-[11.5px] text-[color:var(--color-muted)]">{p.footer}</footer> : null}
      </div>
    </div>
  );
}

/** การ์ดข้อความกลางจอ (โทเคนใช้ไม่ได้ · ระบบขัดข้อง) */
export function QrNoticeCard({ testid, title, body }: { testid: string; title: string; body?: string }) {
  return (
    <div data-testid={testid} className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <h2 className="text-[18px] font-bold">{title}</h2>
      {body ? <p className="max-w-sm text-[14px] text-[color:var(--color-muted)]">{body}</p> : null}
    </div>
  );
}
