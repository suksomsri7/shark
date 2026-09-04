import { EmptyState } from "@/components/ui/EmptyState";
import { MoneyText } from "@/components/ui/MoneyText";
import { buildSortHref, type QueryLike } from "./url";
import { DocTableInteractive, type DocTableBodyRow, type DocTableSelectionAction } from "./DocTableInteractive";
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
  selectionActions,
  rowGroupKey,
  rowEligible,
  mobileTitle,
  mobileSubtitle,
  mobileTrailing,
  mobileStatus,
  mobileDateLine,
  footerTotalSatang,
  footerLeft,
  footerRight,
  page,
  pageCount,
  pageSize,
  total,
  emptyText,
  testId,
  initialSelectedIds,
  rowTestId,
  bulkBarTint,
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
  /** WO 1.7 — ปุ่ม bulk ที่ใช้ id ที่เลือก (เช่น "ออกใบวางบิลรวม") */
  selectionActions?: DocTableSelectionAction[];
  /** คีย์จัดกลุ่มของแถว (ผู้ติดต่อ) — คู่กับ selectionActions.requireSameGroup */
  rowGroupKey?: (row: T) => string | undefined;
  /** แถวนี้เข้าเงื่อนไขของปุ่ม bulk ไหม — คู่กับ selectionActions.requireEligible */
  rowEligible?: (row: T) => boolean;
  mobileTitle?: (row: T) => React.ReactNode;
  mobileSubtitle?: (row: T) => React.ReactNode;
  mobileTrailing?: (row: T) => React.ReactNode;
  /** ชิปสถานะการ์ดมือถือ (f13 บรรทัด 1 ขวา) */
  mobileStatus?: (row: T) => React.ReactNode;
  /** "วันที่ออก · ครบกำหนด …" การ์ดมือถือ (f13 บรรทัด 3 ซ้าย) */
  mobileDateLine?: (row: T) => React.ReactNode;
  /** ผลรวมยอดในหน้านี้ (satang) — แสดงท้ายตาราง ถ้าไม่ส่ง = ไม่แสดงแถวสรุป (ใช้ไม่ได้พร้อม footerLeft/footerRight) */
  footerTotalSatang?: number;
  /** WO 5.4 (g11) — เนื้อหาซ้าย/ขวาแถวสรุปแบบกำหนดเอง (แทน "รวมยอดในหน้านี้" ปริยาย) — ส่งมาคู่กันเมื่อ
   *  หน้าต้องการข้อความสรุปเฉพาะทาง (เช่น "ผลรวม N รายการ" + "จำนวนเงิน ฿… · มูลค่าภาษี ฿…") · ไม่ส่ง = พฤติกรรมเดิมทุกหน้า
   *  (Pagination ยังอยู่แถวเดียวกันด้านขวาเหมือนเดิม เว้นแต่ pageCount > 1 ที่จะขึ้นแถวใหม่ใต้แถวสรุปในกรอบเดียวกัน) */
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
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
  /** WO 5.4 (g11) — แถบ bulk พื้นฟ้าอ่อน+ขอบน้ำเงิน แทนพื้นเทาเดิม — ไม่ส่ง = พฤติกรรมเดิม (ดู DocTableInteractive) */
  bulkBarTint?: boolean;
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
    groupKey: rowGroupKey?.(r),
    eligible: rowEligible ? rowEligible(r) : undefined,
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
      selectionActions={selectionActions}
      testId={testId}
      initialSelectedIds={initialSelectedIds}
      bulkBarTint={bulkBarTint}
      footerInsideCard={!!(footerLeft || footerRight)}
      footer={
        footerLeft || footerRight ? (
          // WO 5.4 (g11) — แถวสรุปกำหนดเอง + Pagination "ในการ์ดเดียวกับตาราง/การ์ดแถว" (เหมือน ContactsPanel f5)
          // ⇒ footerInsideCard=true ทำให้ DocTableInteractive วางบล็อกนี้ไว้ต่อท้าย <table>/การ์ดมือถือ ไม่ใช่ลอยแยก
          <div className="flex flex-col gap-2 border-t px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {footerLeft ?? <span />}
              {footerRight ?? <span />}
            </div>
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
        ) : (
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
        )
      }
    />
  );
}

export default DocTable;
