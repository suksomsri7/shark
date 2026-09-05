"use client";

// ContactsPanel — ส่วน interactive ทั้งหมดของหน้าผู้ติดต่อ V2 (WO 3.2 รอบแก้ 2 — เทียบ f5-contacts.png ตรง ๆ)
// เหตุผลที่รวมเป็น client component ก้อนเดียว (แถบซ้าย + แถวปุ่มหัว + ค้นหา + ตาราง + ท้ายตาราง):
//   ปุ่ม "เพิ่มเข้ากลุ่ม" หัวกระดาษ (ต้อง disabled จนกว่าจะติ๊กแถว) กับจำนวน "เลือกอยู่ N รายการ" ท้ายตาราง
//   ต้องอ่าน state เดียวกับ checkbox ในตาราง (คนละตำแหน่งบนจอ แต่พี่น้องกัน) — ยกสถานะ selected ขึ้นมาไว้ที่นี่
//   เซลล์เนื้อหา (ลิงก์/เงิน/วันที่) ยังคำนวณฝั่ง server ส่งเป็น ReactNode เข้ามา (ไม่ยกไปคำนวณซ้ำฝั่ง client)
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccountIcon } from "./AccountIcon";
import { HelpTip } from "./HelpTip";
import { RowActions, type RowActionItem } from "./RowActions";
import { buildHref, type QueryLike } from "./url";
// WO 3.4 — คลิกแถว = แผงโปรไฟล์ 360° เลื่อนเข้าขวา (§7.1 · f5-contacts-menu.png)
import { ContactProfileSlideOver } from "./ContactProfilePanel";

export type ContactsPanelGroupItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
  subtitle?: string;
  /** สีจุดนำหน้า — เข้ม (ทั้งหมด/ลูกค้า/ผู้ขาย/กลุ่มกำหนดเอง) หรือ จาง (ปิดใช้งาน/ที่มา) */
  dotTone?: "strong" | "muted";
};

export type ContactsPanelRow = {
  id: string;
  code: string;
  /** เนื้อหา 6 คอลัมน์: เลขที่ · ชื่อ · ประเภท · เบอร์/อีเมล · ยอดค้าง · เอกสารล่าสุด (คำนวณฝั่ง server) */
  cells: React.ReactNode[];
  rowActions: React.ReactNode; // <RowActions .../> — สลับปุ่มเดสก์ท็อป/มือถือเองในตัว
  mobile: { title: React.ReactNode; subtitle: React.ReactNode; trailing: React.ReactNode; dateLine: React.ReactNode };
};

const TABLE_HEADERS: { label: string; help?: string }[] = [
  { label: "เลขที่" },
  { label: "ชื่อ" },
  { label: "ประเภท" },
  { label: "เบอร์ / อีเมล" },
  { label: "ยอดค้าง", help: "outstanding" },
  { label: "เอกสารล่าสุด" },
];

function GroupDot({ tone }: { tone?: "strong" | "muted" }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: tone === "muted" ? "var(--color-line)" : "var(--color-ink)" }}
    />
  );
}

function GroupNav({ items, testIdPrefix }: { items: ContactsPanelGroupItem[]; testIdPrefix?: string }) {
  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      {items.map((g) => (
        <Link
          key={g.key}
          href={g.href}
          data-testid={testIdPrefix ? `${testIdPrefix}-${g.key}-link` : undefined}
          className="flex items-start gap-2 rounded-lg px-2 py-1.5 border-l-[3px]"
          style={
            g.active
              ? { borderColor: "var(--color-accent)", background: "var(--color-surface-2)", fontWeight: 600 }
              : { borderColor: "transparent" }
          }
        >
          <span className="mt-1.5"><GroupDot tone={g.dotTone} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{g.label}</span>
              <span data-testid={testIdPrefix ? `${testIdPrefix}-${g.key}-count` : undefined}>{g.count}</span>
            </span>
            {g.subtitle && <span className="text-xs font-normal text-[color:var(--color-muted)]">{g.subtitle}</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function ContactsPanel({
  systemId,
  mergeHref,
  mergeCount,
  base,
  pathname,
  searchParams,
  importHref,
  createContactHref,
  sidebarStandard,
  sidebarCustom,
  newGroupHref,
  popularVendorsHref,
  sidebarSource,
  searchQ,
  legalType,
  activeGroupKey,
  groupLabel,
  groupTotal,
  rows,
  page,
  pageSize,
  pageCount,
  total,
  emptyText,
}: {
  systemId: string;
  /** WO 3.4 — ลิงก์ + ตัวนับคู่ซ้ำที่ยังไม่จัดการ (badge ในแถบซ้าย) */
  mergeHref: string;
  mergeCount: number;
  base: string;
  pathname: string;
  searchParams: QueryLike;
  importHref: string;
  createContactHref: string;
  sidebarStandard: ContactsPanelGroupItem[];
  sidebarCustom: ContactsPanelGroupItem[];
  newGroupHref: string;
  popularVendorsHref: string;
  sidebarSource: ContactsPanelGroupItem[];
  searchQ?: string;
  legalType?: string;
  activeGroupKey?: string;
  groupLabel: string;
  groupTotal: number;
  rows: ContactsPanelRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  emptyText: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // WO 3.4 — ผู้ติดต่อที่เปิดแผงโปรไฟล์อยู่ (null = ปิด) · โหลดข้อมูลตอนเปิดเท่านั้น
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  // คลิกแถวแล้วเปิดแผง — ยกเว้นตอนกดลิงก์/ปุ่ม/ช่องติ๊ก (ปล่อยให้ทำงานตามปกติ)
  const rowClick = (id: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,select,label,details,summary")) return;
    setOpenContactId(id);
  };
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allChecked = selected.size > 0 && allIds.every((id) => selected.has(id));

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(allIds));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkGroupHref = buildHref(pathname, searchParams, { bulkIds: [...selected].join(",") }) + "#bulk-group";

  const mobileOverflowItems: RowActionItem[] = [
    { label: "นำเข้า", href: importHref, icon: "import" },
    { label: "พิมพ์รายงาน", icon: "report", onClick: () => window.print() },
    {
      label: "เพิ่มเข้ากลุ่ม",
      icon: "tag",
      disabled: selected.size === 0,
      hint: selected.size === 0 ? "ยังไม่ได้เลือกผู้ติดต่อ (ติ๊กบนจอกว้างก่อน)" : undefined,
      href: selected.size > 0 ? bulkGroupHref : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* หัวกระดาษ — ปุ่มตรงลำดับ f5: [เพิ่มเข้ากลุ่ม][นำเข้า][พิมพ์รายงาน][+ เพิ่มผู้ติดต่อ] (เดสก์ท็อป) */}
      <PageHeader
        title="ผู้ติดต่อ"
        actions={
          <>
            <button
              type="button"
              disabled={selected.size === 0}
              title={selected.size === 0 ? "เลือกผู้ติดต่ออย่างน้อย 1 รายการก่อน" : undefined}
              className={`btn-sm hidden md:inline-flex ${selected.size === 0 ? "cursor-not-allowed opacity-40" : ""}`}
              data-testid="btn-add-to-group"
              onClick={() => {
                if (selected.size > 0) window.location.href = bulkGroupHref;
              }}
            >
              เพิ่มเข้ากลุ่ม
            </button>
            <Link href={importHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex">
              <AccountIcon name="import" className="h-4 w-4" /> นำเข้า
            </Link>
            <button type="button" className="btn-sm hidden items-center gap-1.5 md:inline-flex" onClick={() => window.print()} data-testid="btn-print-report">
              <AccountIcon name="report" className="h-4 w-4" /> พิมพ์รายงาน
            </button>
            <a href={createContactHref} className="btn btn-primary" data-testid="contacts-create-btn">
              + เพิ่มผู้ติดต่อ
            </a>
            {/* มือถือ: เหลือแค่ปุ่มดำ + เมนู "⋯" รวม นำเข้า/พิมพ์รายงาน/เพิ่มเข้ากลุ่ม (เหมือน WO 1.1 mobile overflow) */}
            <span className="md:hidden">
              <RowActions items={mobileOverflowItems} label="เพิ่มเติม" testId="contacts-mobile-overflow" />
            </span>
          </>
        }
      />

      <div className="flex flex-col gap-4 md:flex-row">
        {/* คอลัมน์ซ้าย w-240 — การ์ดเดียวรวมทุกส่วน (§7.1) */}
        <aside
          className="hidden w-[240px] shrink-0 flex-col gap-4 rounded-xl border p-3 md:flex"
          style={{ borderColor: "var(--color-line)" }}
          data-testid="contacts-sidebar"
        >
          <div>
            <h2 className="mb-1 px-2 text-sm font-semibold">กลุ่มมาตรฐาน</h2>
            <GroupNav items={sidebarStandard} testIdPrefix="group" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold">กลุ่มกำหนดเอง</h2>
              <a href={newGroupHref} className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                + เพิ่ม
              </a>
            </div>
            {sidebarCustom.length === 0 ? (
              <p className="px-2 text-xs text-[color:var(--color-muted)]">ยังไม่มีกลุ่ม</p>
            ) : (
              <GroupNav items={sidebarCustom} />
            )}
            <a href={popularVendorsHref} className="mt-1 block px-2 text-xs font-medium" style={{ color: "var(--color-accent)" }} data-testid="btn-popular-vendors">
              + เพิ่มผู้ติดต่อยอดนิยม
            </a>
          </div>
          <div>
            <h2 className="mb-1 px-2 text-sm font-semibold">ที่มา</h2>
            <GroupNav items={sidebarSource} />
            {/* WO 3.4 — ทางเข้าหน้า "รวมผู้ติดต่อซ้ำ" (§7.3) + ตัวนับคู่ที่ยังไม่จัดการ */}
            <Link
              href={mergeHref}
              data-testid="link-contact-merge"
              className="mt-2 flex items-center justify-between gap-2 px-2 text-xs font-medium"
              style={{ color: "var(--color-accent)" }}
            >
              <span>รวมผู้ติดต่อซ้ำ</span>
              {mergeCount > 0 && (
                <span
                  data-testid="merge-candidate-count"
                  className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: "var(--color-danger)", color: "var(--color-surface)" }}
                >
                  {mergeCount}
                </span>
              )}
            </Link>
          </div>
        </aside>

        {/* มือถือ: แถบชิปเลื่อนแนวนอนแทนแถบซ้าย (f13 pattern) */}
        <div className="flex gap-2 overflow-x-auto pb-1 md:hidden" data-testid="contacts-group-chips">
          {[...sidebarStandard, ...sidebarCustom, ...sidebarSource].map((g) => (
            <Link
              key={g.key}
              href={g.href}
              className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm"
              style={
                g.active
                  ? { background: "var(--color-ink)", color: "var(--color-surface)", borderColor: "var(--color-ink)" }
                  : { borderColor: "var(--color-line)" }
              }
            >
              {g.label} {g.count}
            </Link>
          ))}
        </div>

        {/* ตาราง + ค้นหา */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* แถวค้นหา: "กลุ่ม: … N รายชื่อ" ซ้าย · ช่องค้นหา + ตัวกรอง ขวา (f5 — แถวเดียวกัน) */}
          <form action={pathname} method="GET" className="flex flex-wrap items-center justify-between gap-2">
            {activeGroupKey && activeGroupKey !== "all" && <input type="hidden" name="group" value={activeGroupKey} />}
            <h3 className="text-sm" data-testid="group-total-line">
              กลุ่ม: <span className="font-semibold">{groupLabel}</span> <span data-testid="group-total">{groupTotal}</span> รายชื่อ
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-[420px]">
                <AccountIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]" />
                <input
                  type="search"
                  name="q"
                  defaultValue={searchQ}
                  placeholder="ค้นหาชื่อ เลขที่ หรือเบอร์โทร"
                  className="input pl-8"
                  data-testid="contacts-search"
                />
              </div>
              <details className="relative text-sm">
                <summary className="btn-sm w-fit list-none whitespace-nowrap">▽ ตัวกรอง</summary>
                <div
                  className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-[color:var(--color-surface)] p-3 shadow-[0_8px_24px_rgba(10,10,10,.08)]"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                    ประเภท
                    <select name="legalType" defaultValue={legalType ?? ""} className="input">
                      <option value="">ทั้งหมด</option>
                      <option value="COMPANY">นิติบุคคล</option>
                      <option value="PERSON">บุคคลธรรมดา</option>
                    </select>
                  </label>
                  <button type="submit" className="btn btn-primary mt-2 w-full text-xs">
                    ใช้ตัวกรอง
                  </button>
                </div>
              </details>
              {/* ปุ่ม submit ที่มองไม่เห็น — คง Enter-to-submit ไว้แม้มีมากกว่า 1 ช่อง (ค้นหา + ประเภท) */}
              <button type="submit" className="sr-only">ค้นหา</button>
            </div>
          </form>

          {rows.length === 0 ? (
            <EmptyState text={emptyText} action={{ href: createContactHref, label: "+ เพิ่มผู้ติดต่อ" }} />
          ) : (
            <div className="flex flex-col">
              {/* เดสก์ท็อป: ตารางจริง */}
              <div className="hidden overflow-x-auto rounded-lg border md:block" style={{ borderColor: "var(--color-line)" }}>
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr>
                      <th className="w-10 border-b px-3 py-3">
                        <input type="checkbox" aria-label="เลือกทั้งหมด" className="h-4 w-4" checked={allChecked} onChange={toggleAll} />
                      </th>
                      {TABLE_HEADERS.map((h) => (
                        <th key={h.label} className="border-b px-3 pb-3 pt-3 text-left text-xs font-medium text-[color:var(--color-muted)]">
                          {h.label}
                          {h.help && <HelpTip helpKey={h.help} testId={`contacts-help-${h.help}`} />}
                        </th>
                      ))}
                      <th className="border-b px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        data-testid={`contact-row-${r.code}`}
                        onClick={rowClick(r.id)}
                        className="cursor-pointer"
                      >
                        <td className="border-b px-3 py-3" style={{ borderColor: "var(--color-line)" }}>
                          <input type="checkbox" aria-label="เลือกแถวนี้" className="h-4 w-4" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                        </td>
                        {r.cells.map((cell, i) => (
                          <td key={i} className="border-b px-3 py-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
                            {cell}
                          </td>
                        ))}
                        <td className="border-b px-3 py-3 text-right" style={{ borderColor: "var(--color-line)" }}>
                          {r.rowActions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* ท้ายตาราง — ในการ์ดเดียวกัน ไม่ใช่บล็อกลอยแยก (f5) */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
                  <span className="text-[color:var(--color-muted)]" data-testid="selected-count">
                    เลือกอยู่ {selected.size} รายการ
                  </span>
                  <PageSizeFooter pathname={pathname} searchParams={searchParams} page={page} pageSize={pageSize} pageCount={pageCount} total={total} />
                </div>
              </div>

              {/* มือถือ: การ์ด (เนื้อหาเดิม — ไม่แตะ) */}
              <div className="flex flex-col gap-2 md:hidden">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    data-testid={`contact-row-${r.code}-m`}
                    onClick={rowClick(r.id)}
                    className="flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{r.mobile.title}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[color:var(--color-muted)]">{r.mobile.subtitle}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{r.mobile.trailing}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs text-[color:var(--color-muted)]">{r.mobile.dateLine}</span>
                      <span className="shrink-0">{r.rowActions}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 px-1 text-sm">
                  <span className="text-[color:var(--color-muted)]">เลือกอยู่ {selected.size} รายการ</span>
                  <PageSizeFooter pathname={pathname} searchParams={searchParams} page={page} pageSize={pageSize} pageCount={pageCount} total={total} compact />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FAB มือถือ */}
      <a
        href={createContactHref}
        aria-label="เพิ่มผู้ติดต่อ"
        data-testid="contacts-fab"
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-2xl leading-none shadow-[0_8px_24px_rgba(10,10,10,.24)] md:hidden"
        style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
      >
        +
      </a>

      {/* WO 3.4 — แผงโปรไฟล์ 360° (§7.1 · f5-contacts-menu.png) */}
      <ContactProfileSlideOver systemId={systemId} contactId={openContactId} onClose={() => setOpenContactId(null)} />
    </div>
  );
}

// "แสดง [8 ▾] จาก N รายชื่อ · ‹ หน้า P/PC ›" — select เปลี่ยนแล้วสั่งเปลี่ยนหน้าเองทันที (client)
function PageSizeFooter({
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
    <div className="flex flex-wrap items-center gap-3" data-testid="contacts-pagination">
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
            จาก <span data-testid="list-total">{total}</span> รายชื่อ
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

export default ContactsPanel;
