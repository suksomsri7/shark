// HR VIS-5d ▸ settings page + law page frame (mockup 08): left menu · main column · connections mini card — server components, read-only ◂
//   no action / form here · the law menu item is built by each page (its testid literal stays in page.tsx — older suites read it there)
//   ≥1280: 250 px menu | content | 380 px right card · 1024: 220 px menu | content (right card under the content) · <1024: menu = one scrolling row above the content
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getPayrollAccounting } from "./payroll";
import { linePolicyOf } from "./line-link";
import { settingsTabHref, type SettingsTab } from "./settings-view";

const muted = "text-[color:var(--color-muted)]";
type NavKey = SettingsTab | "law" | "staff";

/** menu item class (≥ 44 px · current = bold + left bar like mockup .acc-i) */
export const setNavCls = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm lg:rounded-l-none lg:rounded-r-[10px] lg:border-l-2 ${
    on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface)] font-semibold text-[color:var(--color-ink)]" : `border-transparent ${muted} hover:text-[color:var(--color-ink)]`
  }`;

const ICON: Record<NavKey, ReactNode> = {
  shifts: <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />,
  leave: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
  holidays: <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4M9 15h2" />,
  rules: <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />,
  pay: <path d="M3 7h18v11H3zM3 11h18" />,
  law: <path d="M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" />,
  staff: <path d="M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3" />,
  connect: <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />,
  life: <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />,
};
export function SetNavIcon({ k }: { k: NavKey }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICON[k]}
    </svg>
  );
}

/** left menu: 5 tabs · law (item from the page) · managers (OWNER → shop permission page · Q3) · connections · lifecycle (Q1) */
export async function SettingsNav({ systemId, current, tabs, owner, lawItem }: { systemId: string; current: SettingsTab | "law"; tabs: readonly SettingsTab[]; owner: boolean; lawItem: ReactNode }) {
  const t = await getTranslations("hr.setview");
  const tLife = await getTranslations("hr.life");
  const item = (k: SettingsTab) =>
    tabs.includes(k) ? (
      <li key={k}>
        <a href={settingsTabHref(systemId, k)} data-testid={`hr-set-nav-${k}`} aria-current={current === k ? "page" : undefined} className={setNavCls(current === k)}>
          <SetNavIcon k={k} />
          {k === "life" ? tLife("settings.title") : t(`nav.${k}`)}
        </a>
      </li>
    ) : null;
  return (
    <nav aria-label={t("navLabel")} data-testid="hr-set-nav" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:rounded-2xl lg:border lg:border-[color:var(--color-line)] lg:bg-[color:var(--color-surface-2)] lg:px-3 lg:py-5">
      <p className={`hidden px-3 text-[13px] font-semibold lg:block ${muted}`}>{t("heading")}</p>
      <ul data-scroll="x" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {item("shifts")}
        {item("leave")}
        {item("holidays")}
        {item("rules")}
        {item("pay")}
        <li>{lawItem}</li>
        {owner && (
          <li>
            <Link href="/app/settings/staff" data-testid="hr-set-nav-staff" className={setNavCls(false)}>
              <SetNavIcon k="staff" />
              {t("nav.staff")}
            </Link>
          </li>
        )}
        {item("connect")}
        {item("life")}
      </ul>
      <p className={`hidden border-t border-[color:var(--color-line)] px-3 pt-3 text-xs leading-relaxed lg:block ${muted}`}>{t("footnote")}</p>
    </nav>
  );
}

/** page frame below the HR tabs: menu | main | right card */
export function SettingsFrame({ nav, aside, children }: { nav: ReactNode; aside: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_380px] xl:gap-6">
      <div className="min-w-0 lg:row-span-2 xl:row-span-1">{nav}</div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
      <div className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1">{aside}</div>
    </div>
  );
}

/** card shell of mockup .lt: header row (title · extras) · body · optional footer */
export function SetCard({ title, extra, foot, children, id, testid, labelledBy }: { title: ReactNode; extra?: ReactNode; foot?: ReactNode; children: ReactNode; id?: string; testid?: string; labelledBy?: string }) {
  return (
    <section id={id} data-testid={testid} aria-labelledby={labelledBy} className="min-w-0 overflow-hidden rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[color:var(--color-line)] px-5 py-4">
        <h2 id={labelledBy} className="text-base font-bold">
          {title}
        </h2>
        {extra}
      </div>
      {children}
      {foot && <div className={`flex flex-wrap items-center gap-2.5 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-5 py-3 text-[13px] ${muted}`}>{foot}</div>}
    </section>
  );
}

/** read-only value list (replaces controls the viewer's action would refuse · §7.3) + the reason line */
export function SetReadOnly({ testid, reason, rows }: { testid: string; reason: string; rows: [string, ReactNode][] }) {
  return (
    <div className="flex flex-col gap-2">
      <p role="note" data-testid={testid} className={`rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs ${muted}`}>
        {reason}
      </p>
      <dl className="flex flex-col text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-3 border-t border-[color:var(--color-line)] py-2 first:border-t-0">
            <dt className={`flex-1 ${muted}`}>{k}</dt>
            <dd className="text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** right card "การเชื่อมต่อ (ย่อ)" — accounting link + staff LINE (the two cards this page owns · Q7: no POS/booking/approval/stock rows) */
export async function ConnectionsMini({ ctx }: { ctx: { tenantId: string; systemId: string } }) {
  const t = await getTranslations("hr.setview");
  const [acct, line] = await Promise.all([getPayrollAccounting(ctx), linePolicyOf(ctx)]);
  const rows: { k: string; title: string; sub: string; ok: boolean; href: string; icon: ReactNode }[] = [
    { k: "account", title: t("conn.account"), sub: t("conn.accountSub"), ok: acct.link === "ONE", href: `${settingsTabHref(ctx.systemId, "pay")}#hr-pay-accounting`, icon: <path d="M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" /> },
    { k: "line", title: t("conn.line"), sub: t("conn.lineSub"), ok: line.enabled, href: `${settingsTabHref(ctx.systemId, "connect")}#hr-line-settings`, icon: <path d="M4 6h16v12H4zM4 7l8 6 8-6" /> },
  ];
  return (
    <section data-testid="hr-set-connections" className="rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-6 pb-3 pt-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold">{t("conn.title")}</h2>
        <Link href="/app/settings/connections" className="inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-[color:var(--color-accent)]">
          {t("conn.all")}
        </Link>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.k} className="border-t border-[color:var(--color-line)] first:border-t-0">
            <a href={r.href} data-testid={`hr-set-conn-${r.k}`} className="flex min-h-11 items-center gap-3 py-3 text-sm">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {r.icon}
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-bold">{r.title}</b>
                <span className={`text-xs ${muted}`}>{r.sub}</span>
              </span>
              {r.ok ? (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" title={t("conn.on")}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                  <span className="sr-only">{t("conn.on")}</span>
                </span>
              ) : (
                <span className="h-6 w-6 shrink-0 rounded-full border-[1.5px] border-[color:var(--color-line)]" title={t("conn.off")}>
                  <span className="sr-only">{t("conn.off")}</span>
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
