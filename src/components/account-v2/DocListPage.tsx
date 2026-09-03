import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusTabs, type StatusTabDef, type TabCounts } from "./StatusTabs";
import { ListFilters, type ListFiltersValue, type ContactOption } from "./ListFilters";
import { DocTable, type DocColumn } from "./DocTable";
import { RowActions, type RowActionItem } from "./RowActions";
import { CreateSection } from "./CreateSection";
import type { QueryLike } from "./url";

// หน้ารายการเอกสารมาตรฐาน V2 (DESIGN-SPEC-V2.md §1, §3, §5.1 · mockup f3-invoice-list.png +
// f3-invoice-list-menu.png เดสก์ท็อป · f13-m-invoice-list.png มือถือ) — ใช้ร่วมทุกชนิดเอกสาร (WO 1.1)
//
// องค์ประกอบตามลำดับ (ต้องตรง f3 เป๊ะ ไล่จากบนลงล่าง):
//   1. PageHeader: h1 + ปุ่มรอง "พิมพ์รายงาน"/"นำเข้า" (จางถ้ายังไม่มีปลายทาง) + ปุ่มดำ "+ สร้าง…"
//   2. StatusTabs: แท็บสถานะ+ตัวนับ (จาก LIST_TABS ของ list-tabs.ts — ห้ามประกาศแท็บซ้ำที่นี่)
//   3. ListFilters: ช่วงวันที่/ผู้ติดต่อ/ค้นหา/ตัวกรองเพิ่มเติม
//   4. bulk bar (โผล่เมื่อติ๊ก ≥1) — ผ่าน DocTable/DocTableInteractive
//   5. DocTable: ตาราง (เดสก์ท็อป) / การ์ดแถว (มือถือ) + ทำรายการ ▾ ต่อแถว
//   6. footer: "รวมยอดในหน้านี้" + Pagination ("แสดง 10/20/50 ▾ จาก N รายการ · หน้า n/N")
//   7. ฟอร์มสร้าง (ซ่อนหลังปุ่มดำ "+ สร้าง…" — เปิดเมื่อ #new อยู่ใน URL)
export type BulkActionDef = {
  label: string;
  href?: string;
  danger?: boolean;
  /** true = ยังไม่ทำ (แสดงจาง กดไม่ได้ + title อธิบาย) */
  disabled?: boolean;
  disabledTitle?: string;
};

function BulkButton({ a }: { a: BulkActionDef }) {
  if (a.disabled || !a.href) {
    return (
      <button
        type="button"
        disabled
        title={a.disabledTitle ?? "เร็ว ๆ นี้"}
        className="btn-sm cursor-not-allowed opacity-40"
      >
        {a.label}
      </button>
    );
  }
  return (
    <Link href={a.href} className="btn-sm" style={a.danger ? { color: "var(--color-danger)" } : undefined}>
      {a.label}
    </Link>
  );
}

function HeaderActionButton({
  label,
  href,
  disabledTitle,
}: {
  label: string;
  href?: string;
  disabledTitle?: string;
}) {
  if (!href) {
    return (
      <button type="button" disabled title={disabledTitle ?? "เร็ว ๆ นี้"} className="btn-sm cursor-not-allowed opacity-40">
        {label}
      </button>
    );
  }
  return (
    <Link href={href} className="btn-sm">
      {label}
    </Link>
  );
}

export function DocListPage<T extends { id: string }>({
  base,
  pathname,
  title,
  searchParams,
  tabs,
  tabCounts,
  activeTab,
  filters,
  contacts,
  cols,
  rows,
  rowActionsFor,
  bulkActions,
  mobileTitle,
  mobileSubtitle,
  mobileTrailing,
  rowTestId,
  footerTotalSatang,
  page,
  pageCount,
  pageSize,
  total,
  emptyText,
  createLabel,
  createForm,
  printReportHref,
  extraHeaderActions,
  testId,
  belowTable,
  errorText,
}: {
  base: string;
  pathname: string;
  title: string;
  searchParams: QueryLike;
  tabs: StatusTabDef[];
  tabCounts: TabCounts;
  activeTab: string;
  filters: ListFiltersValue;
  contacts: ContactOption[];
  cols: DocColumn<T>[];
  rows: T[];
  rowActionsFor?: (row: T) => RowActionItem[];
  bulkActions?: BulkActionDef[];
  mobileTitle?: (row: T) => React.ReactNode;
  mobileSubtitle?: (row: T) => React.ReactNode;
  mobileTrailing?: (row: T) => React.ReactNode;
  rowTestId?: (row: T) => string;
  footerTotalSatang?: number;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  emptyText: string;
  /** ป้ายปุ่มดำ เช่น "สร้างใบแจ้งหนี้" — ไม่ส่ง = ไม่มีปุ่มสร้าง (เอกสารที่เกิดจากการแปลงเท่านั้น เช่น RE/TX) */
  createLabel?: string;
  createForm?: React.ReactNode;
  /** ปลายทางพิมพ์รายงานของรายการนี้ — ไม่ส่ง = ปุ่มจาง "เร็ว ๆ นี้" */
  printReportHref?: string;
  extraHeaderActions?: React.ReactNode;
  testId: string;
  /** บล็อกเสริมใต้ตาราง (เช่น สต็อกคงเหลือของหน้าใบเบิกสินค้า) */
  belowTable?: React.ReactNode;
  /** ข้อความ error จาก action ก่อนหน้า (?err=) — ไม่ส่ง = ไม่แสดง */
  errorText?: string;
}) {
  return (
    <div className="flex flex-col gap-5 pb-24">
      <PageHeader
        title={title}
        back={{ href: base, label: "ระบบบัญชี" }}
        actions={
          <>
            <HeaderActionButton label="🖨 พิมพ์รายงาน" href={printReportHref} />
            <HeaderActionButton label="⬇ นำเข้า" />
            {extraHeaderActions}
            {createLabel && (
              <a href="#new" className="btn-primary" data-testid={`${testId}-create-btn`}>
                + {createLabel}
              </a>
            )}
          </>
        }
      />

      {errorText && <p className="text-sm text-[color:var(--color-danger)]">{errorText}</p>}

      <StatusTabs tabs={tabs} counts={tabCounts} active={activeTab} testId={`${testId}-tabs`} />

      <ListFilters
        action={pathname}
        value={filters}
        contacts={contacts}
        resetHref={pathname}
        hiddenFields={{ tab: activeTab }}
        testId={`${testId}-filters`}
      />

      {rows.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <DocTable
          testId={testId}
          cols={cols}
          rows={rows}
          pathname={pathname}
          searchParams={searchParams}
          rowActions={rowActionsFor ? (r) => <RowActions items={rowActionsFor(r)} testId={`${testId}-row-actions-${r.id}`} /> : undefined}
          bulkActions={bulkActions ? <>{bulkActions.map((a, i) => <BulkButton key={i} a={a} />)}</> : undefined}
          mobileTitle={mobileTitle}
          mobileSubtitle={mobileSubtitle}
          mobileTrailing={mobileTrailing}
          rowTestId={rowTestId}
          footerTotalSatang={footerTotalSatang}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          emptyText={emptyText}
        />
      )}

      {belowTable}

      {createLabel && createForm && <CreateSection>{createForm}</CreateSection>}
      {!createLabel && createForm && <div id="new">{createForm}</div>}
    </div>
  );
}

export default DocListPage;
