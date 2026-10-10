"use client";

// RegisterModeTabs.tsx — แถบโหมด 8 แท็บของหน้าขาย (สเปก §2.1 / §2.2 / §4.2 · ภาพ 01 / 20A / 20B)
//   D (≥1280): ไอคอน 14 ซ้ายป้าย 15px · padding 18/22/16 · สูง 58 · active = ตัวหนา + ขีดล่าง accent 2px
//   T/M (768–1279): ไอคอน 19 เหนือป้ายสั้น 13px · padding 8/13/6 · กว้างขั้นต่ำ 64 · เลื่อนแนวนอนได้ถ้าไม่พอ
//   C (<768): ไม่มีแถบนี้ (ภาพ 05ก)
// 🔴 โต๊ะเมื่อสาขาไม่มีโหมดโต๊ะ = แบบ "เร็ว ๆ นี้" ของบ้าน (UI_STANDARD §2.9 · มติ Q13): จาง + ชิป ไม่ใช่ลิงก์ (ไม่พาไปหน้าเปล่า)
// POS P2.8U ▸ มติ 1: "ออเดอร์ออนไลน์" = ลิงก์จริง /pos/orders + ป้ายนับ = counts.byColumn.new (pos-reg-tab-orders-badge) ·
//   ป้ายดึงทุก 10 วิ ขณะแถบนี้ mount (useOrdersBadge) · จอออเดอร์ส่ง ordersBadge จากการดึงของตัวเอง (ไม่ดึงซ้ำ) · ไม่มีคีย์ POS_NAV_KEYS ใหม่ (มติ 7) ◂

import Link from "next/link";
import { useTranslations } from "next-intl";
import { RegisterIcon, type RegisterIconName } from "./RegisterIcon";
import { useOrdersBadge } from "@/components/pos/orders/use-orders-badge"; // POS P2.8U ▸ มติ 1 ◂

type TabKey = "sale" | "tables" | "online-orders" | "bills" | "shift" | "products" | "reports" | "settings";
type Tab = { key: TabKey; msg: string; icon: RegisterIconName; href: string | null };

// POS P2.4U ▸ มติ 1 (Q5): "โต๊ะ" = ลิงก์จริงเมื่อ registerTableModeAction().visible (ผู้เรียกส่ง tablesHref) · ไม่ส่ง/null = ชิป "เร็ว ๆ นี้" เดิม ·
//   active = แท็บของหน้านี้ (หน้า /pos/tables ส่ง "tables" ⇒ "หน้าขาย" กลายเป็นลิงก์กลับ) ◂
export function RegisterModeTabs({
  systemId,
  active = "sale",
  tablesHref = null,
  unitId,
  ordersBadge, // POS P2.8U ▸ undefined = แถบดึงเอง · number/null = จอออเดอร์ส่งให้ ◂
}: {
  systemId: string;
  active?: "sale" | "tables" | "online-orders"; // POS P2.8U ▸ + online-orders ◂
  tablesHref?: string | null;
  unitId?: string;
  ordersBadge?: number | null;
}) {
  const t = useTranslations("pos.register");
  const base = `/app/sys/${systemId}`;
  const unitQ = unitId ? `?unit=${encodeURIComponent(unitId)}` : ""; // POS P2.4U ▸ โหมดโต๊ะ ◂
  const polled = useOrdersBadge(systemId, unitId, ordersBadge === undefined); // POS P2.8U ▸ มติ 1 ◂
  const newOrders = ordersBadge === undefined ? polled : ordersBadge; // POS P2.8U ◂
  const tabs: Tab[] = [
    { key: "sale", msg: "sale", icon: "cash", href: active !== "sale" ? `${base}/pos/register${unitQ}` : null }, // POS P2.4U ▸ โหมดโต๊ะ ◂ · POS P2.8U ▸ + หน้าออเดอร์ ◂
    { key: "tables", msg: "tables", icon: "grid", href: tablesHref }, // POS P2.4U ▸ โหมดโต๊ะ ◂
    { key: "online-orders", msg: "onlineOrders", icon: "truck", href: `${base}/pos/orders${unitQ}` }, // POS P2.8U ▸ มติ 1: ลิงก์จริง ◂
    { key: "bills", msg: "bills", icon: "doc", href: `${base}/pos/sales` },
    { key: "shift", msg: "shift", icon: "clock", href: `${base}/pos/close` },
    { key: "products", msg: "products", icon: "tag", href: `${base}/pos/products` },
    { key: "reports", msg: "reports", icon: "chart", href: `${base}/pos/reports` }, // POS HF-P1CLOSE ▸ หน้ารายงานเปิดแล้วตั้งแต่ P1.17U (O1) ◂
    { key: "settings", msg: "settings", icon: "gear", href: `${base}/pos/settings` }, // POS P1.10 U ▸ หน้าตั้งค่าหน้าขาย ◂
  ];
  const soon = new Set<TabKey>(tablesHref || active === "tables" ? [] : ["tables"]); // POS P2.4U ▸ โต๊ะ live ◂ · POS P2.8U ▸ ออเดอร์ออนไลน์ live ◂
  // ขีดล่าง 2px ทับเส้นขอบของแถบพอดี (mb-[-1px]) · โครงเดียวกันทุกแท็บ ต่างแค่สี/น้ำหนัก
  const cell =
    "relative -mb-px flex shrink-0 flex-col items-center justify-center gap-[3px] border-b-2 px-[13px] pb-1.5 pt-2 text-[13px] whitespace-nowrap min-w-16 xl:min-w-0 xl:flex-row xl:gap-[9px] xl:px-[22px] xl:pb-4 xl:pt-[18px] xl:text-[15px]";
  return (
    <nav
      aria-label={t("tabs.label")}
      className="hidden shrink-0 overflow-x-auto border-b px-2 [scrollbar-width:none] md:flex xl:px-[26px] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const label = (
          <>
            <RegisterIcon name={tab.icon} size={19} className="xl:hidden" />
            <RegisterIcon name={tab.icon} size={14} className="hidden xl:block" />
            <span className="xl:hidden">{t(`tabsShort.${tab.msg}`)}</span>
            <span className="hidden xl:inline">{t(`tabs.${tab.msg}`)}</span>
            {/* POS P2.8U ▸ มติ 1: ป้ายนับออเดอร์ใหม่ (ภาพ 09 · วงดำ) ◂ */}
            {tab.key === "online-orders" && newOrders !== null && newOrders > 0 && (
              <span
                data-testid="pos-reg-tab-orders-badge"
                aria-label={t("tabs.ordersBadge", { count: newOrders })}
                className="absolute right-1 top-1 inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[color:var(--color-ink)] px-1 text-[11px] font-bold leading-none text-[color:var(--color-surface)] tabular-nums xl:static xl:ml-[-2px]"
              >
                {newOrders > 99 ? "99+" : newOrders}
              </span>
            )}
          </>
        );
        if (tab.key === active) { // POS P2.4U ▸ แท็บของหน้านี้ (เดิม = "sale" เสมอ) ◂
          return (
            <span
              key={tab.key}
              data-testid={`pos-reg-tab-${tab.key}`}
              aria-current="page"
              className={`${cell} border-[color:var(--color-accent)] font-bold text-[color:var(--color-ink)]`}
            >
              {label}
            </span>
          );
        }
        if (soon.has(tab.key) || !tab.href) {
          return (
            <span
              key={tab.key}
              data-testid={`pos-reg-tab-${tab.key}`}
              aria-disabled="true"
              title={t("soon")}
              className={`${cell} border-transparent text-[color:var(--color-ink-soft)] opacity-60`}
            >
              {label}
              <span className="hidden rounded-[6px] border px-1.5 text-[11px] leading-[18px] text-[color:var(--color-muted)] xl:inline">{t("soonChip")}</span>
            </span>
          );
        }
        return (
          <Link
            key={tab.key}
            data-testid={`pos-reg-tab-${tab.key}`}
            href={tab.href}
            className={`${cell} border-transparent text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
