"use client";

// FinancePanel — หน้ารายการช่องทางการเงิน V2 (WO 5.1 · DESIGN-SPEC-V2 §10.1)
// เฟรมอ้างอิง: docs/design/account-v2/g9-finance-channels.png · checklist เต็มใน ledger/wo-notes/5.1.md
// มือถือ 390 = การ์ดเรียงเต็มความกว้าง (ไม่มีตาราง อยู่แล้วในรูปแบบการ์ดทั้งเดสก์ท็อป/มือถือ)
import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountIcon } from "./AccountIcon";
import { RowActions, type RowActionItem } from "./RowActions";
import { FinanceSubTabsBar } from "./FinanceSubTabsBar";
import { formatBaht } from "@/lib/ui/money";

export type FinanceSubTab = { key: string; label: string; href: string; active: boolean; badge?: number };

export type FinanceCard = {
  id: string;
  code: string | null;
  name: string;
  subtitle: string;
  balanceSatang: number;
  monthText: string; // "เดือนนี้ +฿126,350.00" | "เดือนนี้ เติมแล้ว 2 ครั้ง"
  monthNegative: boolean;
  rowActions: RowActionItem[];
};

export type FinanceGroupCard = {
  key: string;
  label: string;
  icon: string;
  totalSatang: number;
  accounts: FinanceCard[];
};

export function FinancePanel({
  subTabs,
  headerCount,
  asOfLabel,
  totalSatang,
  groups,
  createHref,
  transferHref,
  errText,
  okText,
}: {
  subTabs: FinanceSubTab[];
  headerCount: number;
  asOfLabel: string;
  totalSatang: number;
  groups: FinanceGroupCard[];
  createHref: string;
  transferHref: string;
  errText?: string;
  okText?: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeader
        title="เงินสด/ธนาคาร/e-Wallet"
        desc={`ทั้งหมด ${headerCount} ช่องทาง · ยอดตามบัญชีแยกประเภท ณ ${asOfLabel} · รวม ${formatBaht(totalSatang, { decimals: true })}`}
        actions={
          <>
            <button type="button" className="btn-sm hidden items-center gap-1.5 md:inline-flex" onClick={() => setExpanded((v) => !v)} data-testid="finance-toggle-all">
              <AccountIcon name="list" className="h-4 w-4" /> ย่อ/ขยายทั้งหมด
            </button>
            <button type="button" className="btn-sm hidden items-center gap-1.5 md:inline-flex" onClick={() => window.print()} data-testid="finance-print">
              <AccountIcon name="report" className="h-4 w-4" /> พิมพ์รายงาน
            </button>
            <Link href={transferHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex" data-testid="finance-transfer-btn">
              <AccountIcon name="swap" className="h-4 w-4" /> โอนระหว่างช่องทาง
            </Link>
            <Link href={createHref} className="btn btn-primary" data-testid="finance-create-btn">
              + เพิ่มช่องทาง
            </Link>
            <span className="md:hidden">
              <RowActions
                label="เพิ่มเติม"
                testId="finance-mobile-overflow"
                items={[
                  { label: "ย่อ/ขยายทั้งหมด", icon: "list", onClick: () => setExpanded((v) => !v) },
                  { label: "พิมพ์รายงาน", icon: "report", onClick: () => window.print() },
                  { label: "โอนระหว่างช่องทาง", icon: "swap", href: transferHref },
                ]}
              />
            </span>
          </>
        }
      />

      {errText && <p className="text-sm text-[color:var(--color-danger)]" data-testid="finance-err">{errText}</p>}
      {okText === "transfer" && <p className="text-sm font-medium" data-testid="finance-ok">โอนเงินระหว่างช่องทางสำเร็จ</p>}

      {/* แถบแท็บย่อยของหมวดการเงิน (WO 5.2: แยกเป็น FinanceSubTabsBar ใช้ร่วม 3 หน้า) */}
      <FinanceSubTabsBar subTabs={subTabs} />

      {groups.length === 0 ? (
        <EmptyState text="ยังไม่มีช่องทางการเงิน — เพิ่มช่องทางเพื่อเริ่มบันทึกเงินสด/ธนาคาร" action={{ href: createHref, label: "+ เพิ่มช่องทาง" }} />
      ) : (
        groups.map((g) => (
          // g9: กลุ่มทั้งก้อน (หัวข้อ + การ์ดช่องทางข้างใน) เป็น "การ์ดเดียว" มีกรอบ/มุมมนล้อมรอบ — ไม่ใช่หัวข้อลอยบนพื้นหลัง
          <section key={g.key} className="card flex flex-col gap-4" data-testid={`finance-group-${g.key}`}>
            <div className="flex items-center gap-2">
              <AccountIcon name={g.icon} className="h-4 w-4 text-[color:var(--color-muted)]" />
              <h2 className="text-sm font-semibold">{g.label}</h2>
              <span className="flex-1" />
              <span className="text-sm font-semibold" data-testid={`finance-group-total-${g.key}`}>
                ยอดรวมกลุ่ม {formatBaht(g.totalSatang, { decimals: true })}
              </span>
            </div>
            {expanded && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.accounts.map((a) => (
                  <div key={a.id} className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid={`finance-card-${a.code ?? a.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{a.name}</div>
                        <div className="truncate text-xs text-[color:var(--color-muted)]">{a.subtitle}</div>
                      </div>
                      {/* g9: รหัส + ⋯ อยู่แถวเดียวกับชื่อ (ไม่ใช่ปุ่ม "ทำรายการ ▾" ยาว) */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {a.code && (
                          <span className="whitespace-nowrap text-xs text-[color:var(--color-muted)]" data-testid={`finance-code-${a.id}`}>
                            {a.code}
                          </span>
                        )}
                        <RowActions trigger="icon" label="ทำรายการ" testId={`finance-row-actions-${a.id}`} items={a.rowActions} />
                      </div>
                    </div>
                    <div className="mt-2 text-xl font-semibold" data-testid={`finance-balance-${a.id}`}>
                      {formatBaht(a.balanceSatang, { decimals: true })}
                    </div>
                    <div
                      className="mt-0.5 text-xs"
                      style={{ color: a.monthNegative ? "var(--color-danger)" : "var(--color-muted)" }}
                      data-testid={`finance-month-${a.id}`}
                    >
                      {a.monthText}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

export default FinancePanel;
