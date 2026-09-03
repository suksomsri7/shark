"use client";

import { useMemo, useState } from "react";

export type DocTableHeaderCell = {
  key: string;
  header: string;
  align?: "left" | "right";
  href?: string; // มี = คอลัมน์นี้ sort ได้
  active?: boolean;
  dir?: "asc" | "desc";
};

export type DocTableBodyCell = { key: string; align?: "left" | "right"; node: React.ReactNode };

export type DocTableBodyRow = {
  id: string;
  cells: DocTableBodyCell[];
  rowActions?: React.ReactNode;
  mobileTitle?: React.ReactNode;
  mobileSubtitle?: React.ReactNode;
  mobileTrailing?: React.ReactNode;
};

// ส่วน interactive ของ DocTable (checkbox เลือกแถว + แถบ bulk sticky) — client เพราะต้องอัปเดตทันทีไม่รีโหลดหน้า
// เซลล์ทั้งหมดถูก render ไว้แล้วฝั่ง server (DocTable.tsx) — ไฟล์นี้แค่ "ประกอบ" ไม่คำนวณเนื้อหา
export function DocTableInteractive({
  headerCells,
  rows,
  selectable = true,
  bulkActions,
  footer,
  testId,
  initialSelectedIds,
}: {
  headerCells: DocTableHeaderCell[];
  rows: DocTableBodyRow[];
  selectable?: boolean;
  /** action slots คงที่ (ปุ่ม/ลิงก์ที่ผู้เรียกเตรียมมาแล้ว) — จำนวนที่เลือกแสดงแยกจากนี้ */
  bulkActions?: React.ReactNode;
  footer?: React.ReactNode;
  testId?: string;
  /** เลือกไว้ล่วงหน้า — ใช้เฉพาะหน้า gallery สำหรับถ่ายภาพ QC (โชว์แถบ bulk ตั้งแต่โหลด) */
  initialSelectedIds?: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
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

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {selectable && selected.size > 0 && (
        <div
          className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-[color:var(--color-surface-2)] px-3 py-2 text-sm"
          data-testid={testId ? `${testId}-bulk-bar` : undefined}
        >
          <span>เลือก {selected.size} รายการ</span>
          <div className="flex flex-wrap gap-2">{bulkActions}</div>
        </div>
      )}

      {/* Desktop: ตารางจริง */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              {selectable && (
                <th className="w-10 border-b px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    className="h-5 w-5"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {headerCells.map((c) => (
                <th
                  key={c.key}
                  className={`border-b px-3 pb-3 pt-3 text-xs font-medium text-[color:var(--color-muted)] ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.href ? (
                    <a
                      href={c.href}
                      className={c.active ? "font-semibold text-[color:var(--color-ink)]" : "hover:underline"}
                    >
                      {c.header}
                      {c.active && (c.dir === "asc" ? " ▲" : " ▼")}
                    </a>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              <th className="border-b px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={testId ? `${testId}-row` : undefined}>
                {selectable && (
                  <td className="border-b border-[color:var(--color-line)] px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="เลือกแถวนี้"
                      className="h-5 w-5"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                )}
                {r.cells.map((c) => (
                  <td
                    key={c.key}
                    className={`border-b border-[color:var(--color-line)] px-3 py-3 text-sm ${
                      c.align === "right" ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {c.node}
                  </td>
                ))}
                <td className="border-b border-[color:var(--color-line)] px-3 py-3 text-right">{r.rowActions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* มือถือ: การ์ดแถว (DataList style) */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm">
            {selectable && (
              <input
                type="checkbox"
                aria-label="เลือกแถวนี้"
                className="mt-0.5 h-5 w-5 shrink-0"
                checked={selected.has(r.id)}
                onChange={() => toggleOne(r.id)}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.mobileTitle}</div>
              {r.mobileSubtitle && (
                <div className="truncate text-xs text-[color:var(--color-muted)]">{r.mobileSubtitle}</div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {r.mobileTrailing}
              {r.rowActions}
            </div>
          </div>
        ))}
      </div>

      {footer}
    </div>
  );
}

export default DocTableInteractive;
