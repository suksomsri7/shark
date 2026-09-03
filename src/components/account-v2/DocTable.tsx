import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { buildSortHref, type QueryLike } from "./url";
import { DocTableInteractive, type DocTableBodyRow } from "./DocTableInteractive";
import { Pagination } from "./Pagination";

export type DocColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  /** ระบุ = คอลัมน์นี้ sort ได้ (ค่าคือ sort key ที่ตรงกับ DocSort ของ service.ts) */
  sort?: string;
};

// ตารางเอกสารมาตรฐาน (DESIGN-SPEC-V2 §1) — server component: คำนวณเซลล์ทั้งหมดฝั่ง server
// ส่วนเลือกแถว/บาร์ bulk เป็น client เฉพาะจุด (DocTableInteractive) — บนมือถือ = การ์ดแถวอัตโนมัติ (props ชุดเดียวกัน)
export function DocTable<T extends { id: string }>({
  cols,
  rows,
  pathname,
  searchParams,
  sort,
  sortDir = "desc",
  selectable = true,
  rowActions,
  bulkActions,
  mobileTitle,
  mobileSubtitle,
  mobileTrailing,
  mobileStatus,
  mobileDateLine,
  footerTotalSatang,
  page,
  pageCount,
  pageSize,
  total,
  emptyText,
  testId,
  initialSelectedIds,
  rowTestId,
}: {
  cols: DocColumn<T>[];
  rows: T[];
  pathname: string;
  searchParams: QueryLike;
  sort?: string;
  sortDir?: "asc" | "desc";
  selectable?: boolean;
  rowActions?: (row: T) => React.ReactNode;
  bulkActions?: React.ReactNode;
  mobileTitle?: (row: T) => React.ReactNode;
  mobileSubtitle?: (row: T) => React.ReactNode;
  mobileTrailing?: (row: T) => React.ReactNode;
  /** ชิปสถานะการ์ดมือถือ (f13 บรรทัด 1 ขวา) */
  mobileStatus?: (row: T) => React.ReactNode;
  /** "วันที่ออก · ครบกำหนด …" การ์ดมือถือ (f13 บรรทัด 3 ซ้าย) */
  mobileDateLine?: (row: T) => React.ReactNode;
  /** ผลรวมยอดในหน้านี้ (satang) — แสดงท้ายตาราง ถ้าไม่ส่ง = ไม่แสดงแถวสรุป */
  footerTotalSatang?: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** จำนวนรายการทั้งหมดที่ตรงตัวกรอง — ส่งต่อให้ Pagination แสดง "จาก N รายการ" + data-testid="list-total" */
  total?: number;
  emptyText: string;
  testId?: string;
  initialSelectedIds?: string[];
  /** testid ต่อแถว เช่น `row-${docNo}` (WO 1.1 §C) — ไม่ส่ง = ไม่ติด testid ต่อแถว */
  rowTestId?: (row: T) => string;
}) {
  if (rows.length === 0) return <EmptyState text={emptyText} />;

  const headerCells = cols.map((c) => ({
    key: c.key,
    header: c.header,
    align: c.align,
    href: c.sort ? buildSortHref(pathname, searchParams, c.sort, { currentSort: sort, currentDir: sortDir }) : undefined,
    active: c.sort === sort,
    dir: c.sort === sort ? sortDir : undefined,
  }));

  const bodyRows: DocTableBodyRow[] = rows.map((r) => ({
    id: r.id,
    cells: cols.map((c) => ({ key: c.key, align: c.align, node: c.render(r) })),
    rowActions: rowActions?.(r),
    mobileTitle: mobileTitle?.(r) ?? cols[0]?.render(r),
    mobileSubtitle: mobileSubtitle?.(r),
    mobileTrailing: mobileTrailing?.(r),
    mobileStatus: mobileStatus?.(r),
    mobileDateLine: mobileDateLine?.(r),
    testId: rowTestId?.(r),
  }));

  return (
    <DocTableInteractive
      headerCells={headerCells}
      rows={bodyRows}
      selectable={selectable}
      bulkActions={bulkActions}
      testId={testId}
      initialSelectedIds={initialSelectedIds}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-1 pt-2 text-sm">
          {typeof footerTotalSatang === "number" ? (
            <span className="text-[color:var(--color-muted)]">
              รวมยอดในหน้านี้{" "}
              <span data-testid="page-sum">
                <MoneyText satang={footerTotalSatang} decimals />
              </span>
            </span>
          ) : (
            <span />
          )}
          <Pagination
            pathname={pathname}
            searchParams={searchParams}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            testId={testId ? `${testId}-pagination` : undefined}
          />
        </div>
      }
    />
  );
}

export default DocTable;
