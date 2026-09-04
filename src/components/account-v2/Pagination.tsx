"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildPageHref, buildPageSizeHref, type QueryLike } from "./url";

// "แสดง [6 ▾] จาก N รายการ · ‹ หน้า n/N ›" (DESIGN-SPEC-V2 §1 + f3-invoice-list.png / f9-documents.png)
// WO 7.1 round 2 — เปลี่ยนตัวเลือกขนาดหน้าจากลิงก์ข้อความ (10 20 50) เป็น select กรอบเล็ก + ปุ่มลูกศรวงกลมมีขอบ
// ตาม f9 จริง (เดิมเป็นลิงก์ข้อความล้วน ไม่มีกรอบ) — testid ของแต่ละไซซ์เดิม (`${testId}-size-${sz}`) เอาออก
// เพราะไม่มี DOM แยกต่อค่าอีกต่อไป (เป็น <option> เดียว) ไม่มี qc/visual script ใดอ้างอิง testid นั้น (ตรวจแล้ว)
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
  const router = useRouter();
  const arrowCls =
    "flex h-7 w-7 items-center justify-center rounded-full border text-sm leading-none";

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm" data-testid={testId}>
      <label className="flex items-center gap-1.5 text-[color:var(--color-muted)]">
        แสดง
        <select
          className="rounded-lg border bg-transparent px-2 py-1 text-sm text-[color:var(--color-ink)]"
          style={{ borderColor: "var(--color-line)" }}
          value={pageSize}
          onChange={(e) => router.push(buildPageSizeHref(pathname, searchParams, Number(e.target.value)))}
          data-testid={testId ? `${testId}-size` : undefined}
          aria-label="จำนวนแถวต่อหน้า"
        >
          {pageSizeOptions.map((sz) => (
            <option key={sz} value={sz}>
              {sz}
            </option>
          ))}
        </select>
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
        aria-label="หน้าก่อนหน้า"
        className={`${arrowCls} ${page <= 1 ? "pointer-events-none opacity-30" : ""}`}
        style={{ borderColor: "var(--color-line)" }}
      >
        ‹
      </Link>
      <Link
        href={buildPageHref(pathname, searchParams, Math.min(page + 1, pageCount))}
        aria-disabled={page >= pageCount}
        aria-label="หน้าถัดไป"
        className={`${arrowCls} ${page >= pageCount ? "pointer-events-none opacity-30" : ""}`}
        style={{ borderColor: "var(--color-line)" }}
      >
        ›
      </Link>
    </div>
  );
}

export default Pagination;
