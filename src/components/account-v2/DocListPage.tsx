import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusTabs, type StatusTabDef, type TabCounts } from "./StatusTabs";
import { ListFilters, type ListFiltersValue, type ContactOption } from "./ListFilters";
import { DocTable, type DocColumn } from "./DocTable";
import { RowActions, type RowActionItem } from "./RowActions";
import { CreateSection } from "./CreateSection";
import { PrintButton } from "./PrintButton";
import type { QueryLike } from "./url";
import type { DocTableSelectionAction } from "./DocTableInteractive";

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
  selectionActions,
  rowGroupKey,
  rowEligible,
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
  importHref,
  extraHeaderActions,
  testId,
  belowTable,
  errorText,
  pageSizeOptions,
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
  /** WO 1.7 — ปุ่ม bulk ที่ผูกกับแถวที่ติ๊กไว้ (f3-invoice-list-menu.png "ออกใบวางบิลรวม") */
  selectionActions?: DocTableSelectionAction[];
  rowGroupKey?: (row: T) => string | undefined;
  rowEligible?: (row: T) => boolean;
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
  /** WO 1.8: ปลายทางปุ่ม "นำเข้า" (`account/import/documents?side=…`) — ไม่ส่ง = ปุ่มจาง "เร็ว ๆ นี้" */
  importHref?: string;
  extraHeaderActions?: React.ReactNode;
  testId: string;
  /** บล็อกเสริมใต้ตาราง (เช่น สต็อกคงเหลือของหน้าใบเบิกสินค้า) */
  belowTable?: React.ReactNode;
  /** ข้อความ error จาก action ก่อนหน้า (?err=) — ไม่ส่ง = ไม่แสดง */
  errorText?: string;
  /** WO 10.1 — ตัวเลือกจำนวนแถวต่อหน้าของ Pagination (ค่าเริ่มต้น [10,20,50]) — ไม่ส่ง = พฤติกรรมเดิม */
  pageSizeOptions?: number[];
}) {
  return (
    <div className="flex flex-col gap-5 pb-28">
      <PageHeader
        title={title}
        desc={mobileSummary ? <span className="md:hidden">{mobileSummary}</span> : undefined}
        actions={
          <>
            <HeaderActionButton label="นำเข้า" href={importHref} />
            {/* 🔴 10.1 (f3): "พิมพ์รายงาน" ต้องกดได้เสมอ (ไม่จาง) — ไม่มีหน้ารายงานเฉพาะทางแยกต่างหากเลยสักหน้า
                (printReportHref ไม่เคยถูกส่งมาจาก route ไหน) ⇒ ถ้าไม่ได้ส่ง href มา ใช้ window.print() ของรายการนี้แทน */}
            {printReportHref ? (
              <HeaderActionButton label="พิมพ์รายงาน" href={printReportHref} />
            ) : (
              <PrintButton className="btn-sm shrink-0 whitespace-nowrap" testId={`${testId}-print`} />
            )}
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
        <EmptyState
          text={emptyText}
          action={createLabel ? { href: createHref ?? "#new", label: `+ สร้าง${createLabel}` } : undefined}
        />
      ) : (
        <DocTable
          testId={testId}
          cols={cols}
          rows={rows}
          pathname={pathname}
          searchParams={searchParams}
          rowActions={rowActionsFor ? (r) => <RowActions items={rowActionsFor(r)} testId={`${testId}-row-actions-${r.id}`} /> : undefined}
          bulkActions={bulkActions ? <>{bulkActions.map((a, i) => <BulkButton key={i} a={a} />)}</> : undefined}
          selectionActions={selectionActions}
          rowGroupKey={rowGroupKey}
          rowEligible={rowEligible}
          mobileTitle={mobileTitle}
          mobileSubtitle={mobileSubtitle}
          mobileTrailing={mobileTrailing}
          mobileStatus={mobileStatus}
          mobileDateLine={mobileDateLine}
          rowTestId={rowTestId}
          // 🔴 10.1 (f3): footer "รวมยอดในหน้านี้ + แสดง n ▾ จาก N รายการ ‹ หน้า …" ต้องอยู่ "ในกรอบการ์ดเดียวกับ
          // ตาราง" (border-t ต่อท้ายแถวสุดท้าย) ไม่ใช่ลอยแยกใต้การ์ด — ใช้ footerLeft/footerOneLine (ลาย WO 5.4/7.1)
          // แทน footerTotalSatang ตรง ๆ (ซึ่งเข้า branch footerInsideCard=false ของ DocTable) เพื่อบังคับ inside-card
          // เสมอ แม้หน้าที่ไม่มีผลรวมให้โชว์ (footerLeft ว่างเป็น <span/> ก็ยังได้ layout เดียวกัน)
          footerLeft={
            typeof footerTotalSatang === "number" ? (
              <span className="text-[color:var(--color-muted)]">
                รวมยอดในหน้านี้{" "}
                <span data-testid="page-sum">
                  <MoneyText satang={footerTotalSatang} decimals />
                </span>
              </span>
            ) : (
              <span />
            )
          }
          footerOneLine
          pageSizeOptions={pageSizeOptions}
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
