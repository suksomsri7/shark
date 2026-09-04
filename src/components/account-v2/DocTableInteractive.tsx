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

/** WO 1.7 — ปุ่ม bulk ที่ "ต้องรู้ว่าเลือกแถวไหนอยู่" (f3-invoice-list-menu.png: "ออกใบวางบิลรวม")
 *  ส่งเป็นข้อมูลล้วน (ไม่ใช่ callback) เพราะฝั่งเรียกเป็น server component — ประกอบ URL ในไคลเอนต์แทน */
export type DocTableSelectionAction = {
  label: string;
  /** URL ปลายทาง — `{ids}` จะถูกแทนที่ด้วย id ที่เลือก คั่นด้วย `,` */
  hrefTemplate: string;
  /** ต้องเลือกแถวที่ groupKey (เช่น ผู้ติดต่อ) เดียวกันทั้งหมด */
  requireSameGroup?: boolean;
  sameGroupHint?: string;
  /** ต้องเลือกเฉพาะแถวที่ `eligible` (เช่น ยังค้างชำระอยู่) */
  requireEligible?: boolean;
  eligibleHint?: string;
  /** WO 5.4 (g11) — "primary" = ปุ่มดำเข้ม (btn-primary) แทนปุ่มขอบจาง (btn-sm) ปริยาย · ไม่ส่ง = พฤติกรรมเดิม */
  variant?: "primary";
};

export type DocTableBodyRow = {
  id: string;
  cells: DocTableBodyCell[];
  /** คีย์จัดกลุ่มของแถว (ผู้ติดต่อ) — ใช้กับ selectionAction.requireSameGroup */
  groupKey?: string;
  /** แถวนี้เข้าเงื่อนไขของ selectionAction ไหม (เช่น ยังค้างชำระ) */
  eligible?: boolean;
  rowActions?: React.ReactNode;
  /** เลขที่เอกสาร (ตัวหนา ลิงก์) — บรรทัด 1 ซ้ายของการ์ดมือถือ (f13) */
  mobileTitle?: React.ReactNode;
  /** ผู้ติดต่อ/ผู้ขาย — บรรทัด 2 ซ้าย */
  mobileSubtitle?: React.ReactNode;
  /** ยอดเงิน (ตัวหนา) — บรรทัด 2 ขวา */
  mobileTrailing?: React.ReactNode;
  /** ชิปสถานะ — บรรทัด 1 ขวา */
  mobileStatus?: React.ReactNode;
  /** "วันที่ออก · ครบกำหนด …" (สีเทา — แดงเฉพาะวันที่ที่เกิน) — บรรทัด 3 ซ้าย */
  mobileDateLine?: React.ReactNode;
  /** data-testid ต่อแถว เช่น `row-IV-202609-0012` (WO 1.1 §C) */
  testId?: string;
};

// ส่วน interactive ของ DocTable (checkbox เลือกแถว + แถบ bulk sticky) — client เพราะต้องอัปเดตทันทีไม่รีโหลดหน้า
// เซลล์ทั้งหมดถูก render ไว้แล้วฝั่ง server (DocTable.tsx) — ไฟล์นี้แค่ "ประกอบ" ไม่คำนวณเนื้อหา
export function DocTableInteractive({
  headerCells,
  rows,
  selectable = true,
  bulkActions,
  selectionActions,
  footer,
  testId,
  initialSelectedIds,
  bulkBarTint,
  footerInsideCard,
}: {
  headerCells: DocTableHeaderCell[];
  rows: DocTableBodyRow[];
  selectable?: boolean;
  /** action slots คงที่ (ปุ่ม/ลิงก์ที่ผู้เรียกเตรียมมาแล้ว) — จำนวนที่เลือกแสดงแยกจากนี้ */
  bulkActions?: React.ReactNode;
  /** ปุ่ม bulk ที่ผูกกับ id ที่เลือก (WO 1.7) */
  selectionActions?: DocTableSelectionAction[];
  footer?: React.ReactNode;
  testId?: string;
  /** เลือกไว้ล่วงหน้า — ใช้เฉพาะหน้า gallery สำหรับถ่ายภาพ QC (โชว์แถบ bulk ตั้งแต่โหลด) */
  initialSelectedIds?: string[];
  /** WO 5.4 (g11) — true = แถบ bulk พื้นฟ้าอ่อน+ขอบน้ำเงิน (โทนเดียวกับแถวแนะนำจับคู่ใน 5.3 ReconcilePanel)
   *  แทนพื้นเทาเดิม · ไม่ส่ง = พฤติกรรมเดิมทุกหน้า (WO 1.7 ฯลฯ ไม่กระทบ) */
  bulkBarTint?: boolean;
  /** WO 5.4 (g11) — true = วาง footer "ในกรอบเดียวกับตาราง/การ์ด" (border-t ต่อจากแถวสุดท้าย ไม่ใช่บล็อกลอยแยก)
   *  ไม่ส่ง = พฤติกรรมเดิม (footer ลอยใต้กรอบ — ทุกหน้าอื่นไม่กระทบ) */
  footerInsideCard?: boolean;
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
          className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          style={
            bulkBarTint
              ? { background: "#eff4ff", borderColor: "var(--color-accent)" }
              : { background: "var(--color-surface-2)" }
          }
          data-testid={testId ? `${testId}-bulk-bar` : undefined}
        >
          <span className={bulkBarTint ? "font-semibold" : undefined} data-testid={testId ? `${testId}-bulk-count` : undefined}>
            เลือก {selected.size} รายการ
          </span>
          <div className="flex flex-wrap gap-2">
            {(selectionActions ?? []).map((a, i) => {
              const picked = rows.filter((r) => selected.has(r.id));
              const groups = new Set(picked.map((r) => r.groupKey ?? ""));
              const badGroup = !!a.requireSameGroup && groups.size > 1;
              const badEligible = !!a.requireEligible && picked.some((r) => r.eligible === false);
              const why = badGroup ? (a.sameGroupHint ?? "ต้องเลือกของผู้ติดต่อรายเดียวกัน") : badEligible ? (a.eligibleHint ?? "เลือกได้เฉพาะเอกสารที่ยังค้างชำระ") : "";
              if (why) {
                return (
                  <button
                    key={i}
                    type="button"
                    disabled
                    title={why}
                    className="btn-sm cursor-not-allowed opacity-40"
                    data-testid={`${testId}-bulk-action-${i}`}
                  >
                    {a.label}
                  </button>
                );
              }
              return (
                <a
                  key={i}
                  href={a.hrefTemplate.replace("{ids}", encodeURIComponent(picked.map((r) => r.id).join(",")))}
                  className={a.variant === "primary" ? "btn btn-primary" : "btn-sm"}
                  data-testid={`${testId}-bulk-action-${i}`}
                >
                  {a.label}
                </a>
              );
            })}
            {bulkActions}
          </div>
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
              <tr key={r.id} data-testid={r.testId ?? (testId ? `${testId}-row` : undefined)}>
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
        {/* WO 5.4 (g11) — ท้ายตาราง "ในการ์ดเดียวกัน" ไม่ใช่บล็อกลอยแยก (pattern เดียวกับ ContactsPanel f5) */}
        {footerInsideCard && footer}
      </div>

      {/* มือถือ (f13): การ์ดแถว 3 บรรทัด — เลขที่+ชิป / ผู้ติดต่อ+ยอด / วันที่·ครบกำหนด+⋯ (ไม่มี checkbox/ปุ่มยาว) */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            data-testid={r.testId ? `${r.testId}-m` : undefined}
            className="flex flex-col gap-1 rounded-lg border px-3 py-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{r.mobileTitle}</span>
              <span className="shrink-0">{r.mobileStatus}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[color:var(--color-muted)]">{r.mobileSubtitle}</span>
              <span className="shrink-0 font-semibold tabular-nums">{r.mobileTrailing}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-[color:var(--color-muted)]">{r.mobileDateLine}</span>
              <span className="shrink-0">{r.rowActions}</span>
            </div>
          </div>
        ))}
        {footerInsideCard && footer}
      </div>

      {!footerInsideCard && footer}
    </div>
  );
}

export default DocTableInteractive;
