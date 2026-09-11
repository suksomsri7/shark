// ReportTabs.tsx — แถบแท็บ 7 ของหน้ารายงานสมาชิก (M3.8 · ภาพ 25 · testid `reports-tabs` · `reports-tab-<key>`)
// server component ล้วน — แท็บคือลิงก์ `?tab=<key>` (เปิดแท็บ = โหลดเฉพาะรายงานของแท็บนั้นจากเซิร์ฟเวอร์)
import Link from "next/link";
import { REPORT_TABS, REPORT_TAB_LABELS, type ReportTab } from "@/lib/modules/member/reports-shared";

export function ReportTabs({ systemId, tab }: { systemId: string; tab: ReportTab }) {
  const base = `/app/sys/${systemId}/member/reports`;
  return (
    <nav data-testid="reports-tabs" aria-label="แท็บรายงาน" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto border-b pb-px">
      {REPORT_TABS.map((key) => {
        const active = key === tab;
        return (
          <Link
            key={key}
            data-testid={`reports-tab-${key}`}
            href={key === "overview" ? base : `${base}?tab=${key}`}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-2 text-sm transition-colors ${
              active
                ? "border-b-2 border-[color:var(--color-accent)] font-semibold text-[color:var(--color-ink)]"
                : "text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {REPORT_TAB_LABELS[key]}
          </Link>
        );
      })}
    </nav>
  );
}

export default ReportTabs;
