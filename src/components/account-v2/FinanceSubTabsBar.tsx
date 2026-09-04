// FinanceSubTabsBar — แถบแท็บย่อยของหมวดการเงิน (WO 5.1 FinancePanel เดิม → แยกออกมาใช้ร่วม WO 5.2)
// ภาพรวม · เงินสด/ธนาคาร/e-Wallet · เงินสดย่อย · เช็ครับ · เช็คจ่าย · ภาษีถูกหัก/หัก ณ ที่จ่าย
// เดสก์ท็อป = ขีดเส้นใต้ (เหมือน StatusTabs) · มือถือ 390 = ชิปเลื่อนแนวนอน (WO 3.2 pattern)
import Link from "next/link";
import type { FinanceSubTab } from "./FinancePanel";

export function FinanceSubTabsBar({ subTabs }: { subTabs: FinanceSubTab[] }) {
  return (
    <div data-testid="finance-subtabs">
      <div className="hidden gap-4 overflow-x-auto border-b pb-px md:flex" style={{ borderColor: "var(--color-line)" }} role="tablist">
        {subTabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            className="shrink-0 whitespace-nowrap pb-2 text-sm"
            style={{
              color: t.active ? "var(--color-ink)" : "var(--color-muted)",
              fontWeight: t.active ? 600 : 400,
              borderBottom: t.active ? "2px solid var(--color-accent)" : "2px solid transparent",
            }}
            data-testid={`finance-subtab-${t.key}`}
          >
            {t.label}
            {t.badge != null && <span className="ml-1">{t.badge}</span>}
          </Link>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden" role="tablist">
        {subTabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm"
            style={
              t.active
                ? { background: "var(--color-ink)", color: "var(--color-surface)", borderColor: "var(--color-ink)" }
                : { borderColor: "var(--color-line)" }
            }
            data-testid={`finance-subtab-${t.key}-m`}
          >
            {t.label}
            {t.badge != null && <span className="ml-1 opacity-80">{t.badge}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default FinanceSubTabsBar;
