import Link from "next/link";
import { buildPageHref, buildPageSizeHref, type QueryLike } from "./url";

// "แสดง 10/20/50 ▾ จาก N รายการ · หน้า n/N ‹ ›" (DESIGN-SPEC-V2 §1 + f3-invoice-list.png)
export function Pagination({
  pathname,
  searchParams,
  page,
  pageCount,
  pageSize,
  /** จำนวนรายการทั้งหมดที่ตรงตัวกรอง (ไม่ใช่แค่หน้านี้) — ไม่ส่ง = ไม่แสดง "จาก N รายการ" */
  total,
  pageSizeOptions = [10, 20, 50],
  testId,
}: {
  pathname: string;
  searchParams: QueryLike;
  page: number;
  pageCount: number;
  pageSize: number;
  total?: number;
  pageSizeOptions?: number[];
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm" data-testid={testId}>
      <label className="flex items-center gap-1 text-[color:var(--color-muted)]">
        แสดง
        <span className="flex gap-1">
          {pageSizeOptions.map((sz) => (
            <Link
              key={sz}
              href={buildPageSizeHref(pathname, searchParams, sz)}
              className={sz === pageSize ? "font-semibold text-[color:var(--color-ink)]" : "underline"}
              data-testid={testId ? `${testId}-size-${sz}` : undefined}
            >
              {sz}
            </Link>
          ))}
        </span>
        ▾
        {typeof total === "number" && (
          <span>
            จาก <span data-testid="list-total">{total}</span> รายการ
          </span>
        )}
      </label>
      <span className="text-[color:var(--color-muted)]">
        หน้า {page}/{pageCount}
      </span>
      <Link
        href={buildPageHref(pathname, searchParams, Math.max(page - 1, 1))}
        aria-disabled={page <= 1}
        className={page <= 1 ? "pointer-events-none opacity-30" : ""}
      >
        ‹
      </Link>
      <Link
        href={buildPageHref(pathname, searchParams, Math.min(page + 1, pageCount))}
        aria-disabled={page >= pageCount}
        className={page >= pageCount ? "pointer-events-none opacity-30" : ""}
      >
        ›
      </Link>
    </div>
  );
}

export default Pagination;
