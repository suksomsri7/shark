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
// องค์ประกอบตามลำดับ (ต้องตรง f3/f13 เป๊ะ ไล่จากบนลงล่าง):
//   1. PageHeader (ไม่มี back — breadcrumb เหนือหน้าให้ทางกลับอยู่แล้ว): h1 + บรรทัดสรุปมือถือ + ปุ่มรอง
//      "นำเข้า"/"พิมพ์รายงาน" (จางถ้ายังไม่มีปลายทาง) + ปุ่มดำ "+ สร้าง<ชนิด>" (เดสก์ท็อปเท่านั้น — มือถือใช้ FAB)
//   2. StatusTabs: แท็บสถานะ+ตัวนับ (จาก LIST_TABS ของ list-tabs.ts — ห้ามประกาศแท็บซ้ำที่นี่)
//   3. ListFilters: ช่วงวันที่/ผู้ติดต่อ/ค้นหา/ตัวกรองเพิ่มเติม (เดสก์ท็อป 1 แถว · มือถือ ช่องค้นหา+ปุ่มกรวยเปิด sheet)
//   4. bulk bar (โผล่เมื่อติ๊ก ≥1) — ผ่าน DocTable/DocTableInteractive
//   5. DocTable: ตาราง (เดสก์ท็อป) / การ์ดแถว 3 บรรทัด (มือถือ) + ทำรายการ ▾ / ⋯ ต่อแถว
//   6. footer: "รวมยอดในหน้านี้" + Pagination ("แสดง 10/20/50 ▾ จาก N รายการ · หน้า n/N")
//   7. ฟอร์มสร้าง (ซ่อนหลังปุ่มดำ "+ สร้าง…"/FAB — เปิดเมื่อ #new อยู่ใน URL)
//   8. FAB ดำลอยมุมล่างขวา (มือถือเท่านั้น) เหนือ orb AI
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
      <button
        type="button"
        disabled
        title={disabledTitle ?? "เร็ว ๆ นี้"}
        className="btn-sm shrink-0 cursor-not-allowed whitespace-nowrap opacity-40"
      >
        {label}
      </button>
    );
  }
  return (
    <Link href={href} className="btn-sm shrink-0 whitespace-nowrap">
      {label}
    </Link>
  );
}

export function DocListPage<T extends { id: string }>({
  base,
  pathname,
  title,
  mobileSummary,
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
  mobileStatus,
  mobileDateLine,
  rowTestId,
  footerTotalSatang,
  page,
  pageCount,
  pageSize,
  total,
  emptyText,
  createLabel,
  createHref,
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
  /** บรรทัดสรุปใต้ h1 — โชว์เฉพาะมือถือ (f13: "51 ใบ · ค้างรับ ฿486,300.00") — ไม่ส่ง = ไม่แสดง */
  mobileSummary?: React.ReactNode;
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
  mobileStatus?: (row: T) => React.ReactNode;
  mobileDateLine?: (row: T) => React.ReactNode;
  rowTestId?: (row: T) => string;
  footerTotalSatang?: number;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  emptyText: string;
  /** ป้ายชนิดเอกสาร เช่น "ใบแจ้งหนี้" — ปุ่มจะขึ้นเป็น "+ สร้างใบแจ้งหนี้" เสมอ — ไม่ส่ง = ไม่มีปุ่มสร้าง (เอกสารที่เกิดจากการแปลงเท่านั้น เช่น RE/TX) */
  createLabel?: string;
  /** WO 1.3: ปลายทางของปุ่ม "+ สร้าง…" = ฟอร์มเต็มหน้า `<route>/new` — ส่งมาแล้วจะไม่ใช้ createForm/#new อีก */
  createHref?: string;
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
    <div className="flex flex-col gap-5 pb-28">
      <PageHeader
        title={title}
        desc={mobileSummary ? <span className="md:hidden">{mobileSummary}</span> : undefined}
        actions={
          <>
            <HeaderActionButton label="นำเข้า" />
            <HeaderActionButton label="พิมพ์รายงาน" href={printReportHref} />
            {extraHeaderActions}
            {createLabel &&
              (createHref ? (
                <Link
                  href={createHref}
                  className="btn btn-primary hidden shrink-0 whitespace-nowrap md:inline-flex"
                  data-testid={`${testId}-create-btn`}
                >
                  + สร้าง{createLabel}
                </Link>
              ) : (
                <a
                  href="#new"
                  className="btn btn-primary hidden shrink-0 whitespace-nowrap md:inline-flex"
                  data-testid={`${testId}-create-btn`}
                >
                  + สร้าง{createLabel}
                </a>
              ))}
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
          mobileStatus={mobileStatus}
          mobileDateLine={mobileDateLine}
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

      {createLabel && !createHref && createForm && <CreateSection>{createForm}</CreateSection>}
      {!createLabel && createForm && <div id="new">{createForm}</div>}

      {/* FAB ดำลอยมุมล่างขวา (มือถือเท่านั้น) — เหนือ orb AI (AiDock: fixed bottom-4 right-4 h-10 w-10) */}
      {createLabel &&
        (createHref ? (
          <Link
            href={createHref}
            aria-label={`สร้าง${createLabel}`}
            data-testid={`${testId}-fab`}
            className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-2xl leading-none shadow-[0_8px_24px_rgba(10,10,10,.24)] md:hidden"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
          >
            +
          </Link>
        ) : (
          <a
            href="#new"
            aria-label={`สร้าง${createLabel}`}
            data-testid={`${testId}-fab`}
            className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-2xl leading-none shadow-[0_8px_24px_rgba(10,10,10,.24)] md:hidden"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
          >
            +
          </a>
        ))}
    </div>
  );
}

export default DocListPage;
