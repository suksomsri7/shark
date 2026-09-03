"use client";

// ProductsPanel — หน้ารายการสินค้า/บริการ V2 (WO 4.3 · DESIGN-SPEC-V2 §8.1)
// เฟรมอ้างอิง: docs/design/account-v2/f6-products.png + f6-products-menu.png (เมนู "ทำรายการ")
// มือถือ 390 = การ์ด + แถบชิปแท็บ (แบบเดียวกับ f13/ContactsPanel)
// checklist ที่ไล่ทีละองค์ประกอบ + ความต่างที่ตั้งใจ อยู่ใน ledger/wo-notes/4.3.md
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountIcon } from "./AccountIcon";
import { RowActions, type RowActionItem } from "./RowActions";
import { buildHref, type QueryLike } from "./url";

export type ProductTypeTab = { key: string; label: string; count: number; href: string; active: boolean };

export type TrackedCard = {
  id: string;
  name: string;
  stockText: string;
  reorderText: string;
  ratio: number;
  negative: boolean;
  low: boolean;
};

export type ProductRow = {
  id: string;
  code: string;
  /** 9 คอลัมน์ตาม f6: รหัส · ชื่อสินค้า · หมวด · หน่วย · จำนวนคงเหลือ · ต้นทุน/หน่วย · ราคาขาย/หน่วย · VAT */
  cells: React.ReactNode[];
  rowActions: RowActionItem[];
  mobile: { title: React.ReactNode; subtitle: React.ReactNode; trailing: React.ReactNode; foot: React.ReactNode };
};

const TABLE_HEADERS = ["รหัส", "ชื่อสินค้า", "หมวด", "หน่วย", "จำนวนคงเหลือ", "ต้นทุน/หน่วย", "ราคาขาย/หน่วย", "VAT"];
const RIGHT_ALIGNED = new Set([4, 5, 6]);

export function ProductsPanel({
  pathname,
  searchParams,
  typeTabs,
  subTabs,
  trackedCards,
  trackedHref,
  inventoryHref,
  importHref,
  createHref,
  categories,
  activeCategory,
  searchQ,
  rows,
  page,
  pageSize,
  pageCount,
  total,
  stockValueText,
  emptyText,
  errorText,
}: {
  pathname: string;
  searchParams: QueryLike;
  typeTabs: ProductTypeTab[];
  subTabs: ProductTypeTab[];
  trackedCards: TrackedCard[];
  trackedHref: string;
  inventoryHref: string | null;
  importHref: string;
  createHref: string;
  categories: string[];
  activeCategory?: string;
  searchQ?: string;
  rows: ProductRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  stockValueText: string | null;
  emptyText: string;
  errorText?: string;
}) {
  const go = (href: string) => {
    window.location.href = href;
  };
  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* หัวกระดาษ — ลำดับปุ่มตรง f6: [⤓ นำเข้าสินค้า][🖨 พิมพ์รายงาน][+ เพิ่มสินค้า (ดำ)] */}
      <PageHeader
        title="สินค้า/บริการ"
        actions={
          <>
            <Link href={importHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex" data-testid="products-import">
              <AccountIcon name="import" className="h-4 w-4" /> นำเข้าสินค้า
            </Link>
            <button
              type="button"
              className="btn-sm hidden items-center gap-1.5 md:inline-flex"
              onClick={() => window.print()}
              data-testid="products-print"
            >
              <AccountIcon name="report" className="h-4 w-4" /> พิมพ์รายงาน
            </button>
            <a href={createHref} className="btn btn-primary" data-testid="products-create-btn">
              + เพิ่มสินค้า
            </a>
            <span className="md:hidden">
              <RowActions
                label="เพิ่มเติม"
                testId="products-mobile-overflow"
                items={[
                  { label: "นำเข้าสินค้า", href: importHref, icon: "import" },
                  { label: "พิมพ์รายงาน", icon: "report", onClick: () => window.print() },
                  ...(inventoryHref ? [{ label: "ไปที่คลังสินค้า ↗", href: inventoryHref, icon: "box" }] : []),
                ]}
              />
            </span>
          </>
        }
      />

      {errorText && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }} data-testid="products-error">
          {errorText}
        </p>
      )}

      {/* แท็บชนิด: สินค้า | บริการ | รายการจัดชุด (f6) */}
      <div className="flex gap-6 overflow-x-auto border-b" style={{ borderColor: "var(--color-line)" }} data-testid="product-type-tabs">
        {typeTabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            data-testid={`product-type-${t.key}`}
            className="-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2.5 text-[15px]"
            style={t.active ? { borderColor: "var(--color-ink)", fontWeight: 700 } : { borderColor: "transparent", color: "var(--color-muted)" }}
          >
            {t.label}
            <span className="text-sm" data-testid={`product-type-${t.key}-count`}>
              {t.count}
            </span>
          </Link>
        ))}
      </div>

      {/* การ์ด "สินค้าที่ติดตาม" ≤6 (f6) */}
      {trackedCards.length > 0 && (
        <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="tracked-card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold">สินค้าที่ติดตาม</h2>
            <span className="text-xs text-[color:var(--color-muted)]">ปักหมุดของที่ต้องเฝ้าสต็อก</span>
            <span className="flex-1" />
            <Link href={trackedHref} className="text-xs font-semibold" style={{ color: "var(--color-accent)" }} data-testid="tracked-pick-link">
              เลือกสินค้าที่ติดตาม ›
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trackedCards.map((c) => (
              <div key={c.id} className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={`tracked-${c.id}`}>
                <div className="mb-1 truncate text-sm font-semibold">{c.name}</div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-2xl font-bold tabular-nums"
                    style={c.negative ? { color: "var(--color-danger)" } : undefined}
                    data-testid={`tracked-${c.id}-stock`}
                  >
                    {c.stockText}
                  </span>
                  <span className="text-xs text-[color:var(--color-muted)]">คงเหลือ · {c.reorderText}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-2)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(c.ratio * 100)}%`,
                      background: c.negative || c.low ? "var(--color-danger)" : "var(--color-ink)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* แถวที่ 2: ทั้งหมด | ปิดใช้งาน (ซ้าย) · หมวด + ค้นหา (ขวา) */}
      <form action={pathname} method="GET" className="flex flex-wrap items-center justify-between gap-2">
        {[...searchParamsHidden(searchParams, ["q", "category", "page"])].map(([k, v]) => (
          <input key={`${k}-${v}`} type="hidden" name={k} value={v} />
        ))}
        <div className="flex gap-5" data-testid="product-sub-tabs">
          {subTabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              data-testid={`product-sub-${t.key}`}
              className="-mb-px flex items-center gap-1.5 border-b-2 pb-1.5 text-sm"
              style={t.active ? { borderColor: "var(--color-ink)", fontWeight: 700 } : { borderColor: "transparent", color: "var(--color-muted)" }}
            >
              {t.label}
              <span data-testid={`product-sub-${t.key}-count`}>{t.count}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: "var(--color-line)" }}>
            <span className="text-[color:var(--color-muted)]">หมวด:</span>
            <select
              name="category"
              defaultValue={activeCategory ?? ""}
              className="border-0 bg-transparent font-semibold outline-none"
              aria-label="หมวดหมู่"
              data-testid="product-category-filter"
              onChange={(e) => go(buildHref(pathname, searchParams, { category: e.target.value || undefined, page: undefined }))}
            >
              <option value="">ทั้งหมด</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="relative w-full sm:w-[320px]">
            <AccountIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]" />
            <input
              type="search"
              name="q"
              defaultValue={searchQ}
              placeholder="ค้นหาชื่อสินค้า หรือรหัส"
              className="input pl-8"
              data-testid="products-search"
            />
          </div>
          <button type="submit" className="sr-only">
            ค้นหา
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState text={emptyText} action={{ href: createHref, label: "+ เพิ่มสินค้า" }} />
      ) : (
        <div className="flex flex-col">
          {/* เดสก์ท็อป: ตาราง 9 คอลัมน์ + ท้ายตารางในการ์ดเดียวกัน (f6) */}
          <div className="hidden overflow-x-auto rounded-lg border md:block" style={{ borderColor: "var(--color-line)" }}>
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  {TABLE_HEADERS.map((h, i) => (
                    <th
                      key={h}
                      className={`border-b px-3 py-3 text-xs font-medium text-[color:var(--color-muted)] ${RIGHT_ALIGNED.has(i) ? "text-right" : "text-left"}`}
                      style={{ borderColor: "var(--color-line)" }}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="border-b px-3 py-3" style={{ borderColor: "var(--color-line)" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid={`product-row-${r.code}`}>
                    {r.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={`border-b px-3 py-3 text-sm ${RIGHT_ALIGNED.has(i) ? "text-right tabular-nums" : ""}`}
                        style={{ borderColor: "var(--color-line)" }}
                      >
                        {cell}
                      </td>
                    ))}
                    <td className="border-b px-3 py-3 text-right" style={{ borderColor: "var(--color-line)" }}>
                      <RowActions items={r.rowActions} testId={`product-row-actions-${r.code}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
              <span data-testid="products-stock-value">
                {stockValueText ? (
                  <>
                    มูลค่าสต็อกรวม <b>{stockValueText}</b>
                  </>
                ) : (
                  <span className="text-[color:var(--color-muted)]">รายการนี้ไม่ติดตามสต็อก</span>
                )}
              </span>
              <PageFooter pathname={pathname} searchParams={searchParams} page={page} pageSize={pageSize} pageCount={pageCount} total={total} />
            </div>
          </div>

          {/* มือถือ: การ์ด */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <div key={r.id} data-testid={`product-row-${r.code}-m`} className="flex flex-col gap-1 rounded-lg border px-3 py-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold">{r.mobile.title}</span>
                  <span className="shrink-0 tabular-nums">{r.mobile.trailing}</span>
                </div>
                <div className="truncate text-[color:var(--color-muted)]">{r.mobile.subtitle}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-[color:var(--color-muted)]">{r.mobile.foot}</span>
                  <span className="shrink-0">
                    <RowActions items={r.rowActions} testId={`product-row-actions-${r.code}-m`} />
                  </span>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
              <span className="text-[color:var(--color-muted)]">{stockValueText ? `มูลค่าสต็อกรวม ${stockValueText}` : ""}</span>
              <PageFooter pathname={pathname} searchParams={searchParams} page={page} pageSize={pageSize} pageCount={pageCount} total={total} compact />
            </div>
          </div>
        </div>
      )}

      {/* ลิงก์ไปคลังสินค้า (f6 · ปุ่มขวาล่าง/ท้ายหน้า) */}
      {inventoryHref && (
        <div className="hidden md:block">
          <Link href={inventoryHref} className="text-sm font-semibold" style={{ color: "var(--color-accent)" }} data-testid="products-inventory-link">
            ไปที่คลังสินค้า ↗
          </Link>
        </div>
      )}

      {/* FAB มือถือ */}
      <a
        href={createHref}
        aria-label="เพิ่มสินค้า"
        data-testid="products-fab"
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-2xl leading-none shadow-[0_8px_24px_rgba(10,10,10,.24)] md:hidden"
        style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
      >
        +
      </a>
    </div>
  );
}

/** คีย์ query ที่ต้องพกไปกับฟอร์มค้นหา (ยกเว้นคีย์ที่ฟอร์มคุมเอง) */
function* searchParamsHidden(sp: QueryLike, exclude: string[]): Generator<[string, string]> {
  const entries = sp instanceof URLSearchParams ? [...sp.entries()] : Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]]));
  for (const [k, v] of entries) {
    if (exclude.includes(k)) continue;
    yield [k, String(v)];
  }
}

function PageFooter({
  pathname,
  searchParams,
  page,
  pageSize,
  pageCount,
  total,
  compact,
}: {
  pathname: string;
  searchParams: QueryLike;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  compact?: boolean;
}) {
  const go = (href: string) => {
    window.location.href = href;
  };
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="products-pagination">
      <label className="flex items-center gap-1 text-[color:var(--color-muted)]">
        แสดง
        <select
          aria-label="จำนวนต่อหน้า"
          defaultValue={String(pageSize)}
          className="border-0 bg-transparent underline outline-none"
          onChange={(e) => go(buildHref(pathname, searchParams, { pageSize: e.target.value, page: undefined }))}
        >
          {[8, 10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {!compact && (
          <span>
            จาก <span data-testid="products-total">{total}</span> รายการ
          </span>
        )}
      </label>
      <span className="flex items-center gap-2 text-[color:var(--color-muted)]">
        <button
          type="button"
          aria-label="หน้าก่อนหน้า"
          disabled={page <= 1}
          className={page <= 1 ? "opacity-30" : ""}
          onClick={() => go(buildHref(pathname, searchParams, { page: String(Math.max(page - 1, 1)) }))}
        >
          ‹
        </button>
        หน้า {page}/{pageCount}
        <button
          type="button"
          aria-label="หน้าถัดไป"
          disabled={page >= pageCount}
          className={page >= pageCount ? "opacity-30" : ""}
          onClick={() => go(buildHref(pathname, searchParams, { page: String(Math.min(page + 1, pageCount)) }))}
        >
          ›
        </button>
      </span>
    </div>
  );
}

export default ProductsPanel;
