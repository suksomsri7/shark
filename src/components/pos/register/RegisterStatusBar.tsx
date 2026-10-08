"use client";

// RegisterStatusBar.tsx — แถบสถานะล่าง (D ≥1280 เท่านั้น · ภาพ 01 .sbar · สเปก §2.1 / §4.5)
//   สูง 34 · ขอบบน · พื้น surface-2 · px 18 · ช่องไฟ 26 · ตัว 12 muted · ป้ายแป้น สูง 18 กว้าง ≥22 ตัว 10.5 หนา
//   ซ้าย: แป้นลัด F2 ค้นหา · F4 ชำระ · F8 พักบิล · Esc ล้าง · ขวา: รอตัดสต็อก N · รอซิงก์ N (P3 = 0 เสมอ) · เครื่อง · เครื่องพิมพ์
// POS P1.10 U ▸ ชิปเครื่อง = ชื่อจาก heartbeat (device.name) · ยังไม่ลงทะเบียน = ลิงก์ไปหน้าตั้งค่าเครื่อง (?tab=devices) ·
//   เครื่องพิมพ์: เบราว์เซอร์ = "พิมพ์ผ่านเบราว์เซอร์ N มม." · USB/BT ที่จับคู่แล้ว = "เครื่องพิมพ์ N มม. พร้อม" · อื่น = "ยังไม่เชื่อม" ◂

import Link from "next/link";
import { useTranslations } from "next-intl";
import { RegisterIcon } from "./RegisterIcon";

/** สถานะเครื่อง/เครื่องพิมพ์ของแถบล่าง — undefined = ยังไม่รู้ (ก่อน heartbeat ตอบ) */
export type StatusBarDevice = { name: string | null; settingsHref: string; printer: "browser" | "ready" | "none"; paper: "58" | "80" };

const Kbd = ({ k }: { k: string }) => (
  <kbd className="inline-grid h-[18px] min-w-[22px] place-items-center rounded-[5px] border bg-[color:var(--color-surface)] px-[5px] font-sans text-[10.5px] font-bold text-[color:var(--color-ink-soft)]">{k}</kbd>
);

export function RegisterStatusBar({ pendingStock, pendingSync, device }: { pendingStock: number; pendingSync: number; device?: StatusBarDevice }) {
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
      {device && (
        <>
          <span aria-hidden>·</span>
          {device.name ? (
            <span data-testid="pos-reg-status-device" className="inline-flex items-center gap-1.5">
              <RegisterIcon name="cash" size={12} />
              {t("status.device", { name: device.name })}
            </span>
          ) : (
            <Link data-testid="pos-reg-status-device-link" href={device.settingsHref} className="inline-flex h-[34px] items-center gap-1.5 underline-offset-2 hover:underline">
              <RegisterIcon name="cash" size={12} />
              {t("status.deviceNone")}
            </Link>
          )}
        </>
      )}
      <span aria-hidden>·</span>
      <span data-testid="pos-reg-status-printer" className="inline-flex items-center gap-1.5">
        <RegisterIcon name="print" size={12} />
        {device?.printer === "browser" ? t("status.printerBrowser", { width: device.paper }) : device?.printer === "ready" ? t("status.printerReady", { width: device.paper }) : t("status.printerNone")}
      </span>
    </div>
  );
}
