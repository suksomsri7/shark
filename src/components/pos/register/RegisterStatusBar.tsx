"use client";

// RegisterStatusBar.tsx — แถบสถานะล่าง (D ≥1280 เท่านั้น · ภาพ 01 .sbar · สเปก §2.1 / §4.5)
//   สูง 34 · ขอบบน · พื้น surface-2 · px 18 · ช่องไฟ 26 · ตัว 12 muted · ป้ายแป้น สูง 18 กว้าง ≥22 ตัว 10.5 หนา
//   ซ้าย: แป้นลัด F2 ค้นหา · F4 ชำระ · F8 พักบิล · Esc ล้าง · ขวา: รอตัดสต็อก N · รอซิงก์ N (P3 = 0 เสมอ) · เครื่องพิมพ์ (P1.10 — วันนี้ "ยังไม่เชื่อม")

import { useTranslations } from "next-intl";
import { RegisterIcon } from "./RegisterIcon";

const Kbd = ({ k }: { k: string }) => (
  <kbd className="inline-grid h-[18px] min-w-[22px] place-items-center rounded-[5px] border bg-[color:var(--color-surface)] px-[5px] font-sans text-[10.5px] font-bold text-[color:var(--color-ink-soft)]">{k}</kbd>
);

export function RegisterStatusBar({ pendingStock, pendingSync }: { pendingStock: number; pendingSync: number }) {
  const t = useTranslations("pos.register");
  return (
    <div className="hidden h-[34px] shrink-0 items-center gap-[26px] whitespace-nowrap border-t bg-[color:var(--color-surface-2)] px-[18px] text-[12px] text-[color:var(--color-muted)] xl:flex">
      <div data-testid="pos-reg-shortcuts" className="flex items-center gap-[26px]">
        <span>{t("shortcuts.title")}</span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd k="F2" />
          {t("shortcuts.search")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd k="F4" />
          {t("shortcuts.pay")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd k="F8" />
          {t("shortcuts.hold")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd k="Esc" />
          {t("shortcuts.clear")}
        </span>
      </div>
      <span className="flex-1" />
      <span data-testid="pos-reg-status-stock-pending" className="tabular-nums">
        {t("status.pendingStock", { count: pendingStock.toLocaleString("th-TH") })}
      </span>
      <span aria-hidden>·</span>
      <span data-testid="pos-reg-status-sync-pending" className="tabular-nums">
        {t("status.pendingSync", { count: pendingSync.toLocaleString("th-TH") })}
      </span>
      <span aria-hidden>·</span>
      <span data-testid="pos-reg-status-printer" className="inline-flex items-center gap-1.5">
        <RegisterIcon name="print" size={12} />
        {t("status.printerNone")}
      </span>
    </div>
  );
}
