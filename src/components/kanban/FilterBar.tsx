// FilterBar.tsx — แถบตัวกรองที่เปิดอยู่ (K1.11 · แบบ `.fbar` ใน `ledger/design-kanban/_kb.part` + ภาพ 02)
// "กรองอยู่:" + ชิปเงื่อนไข (กดกากบาทถอดทีละอัน) + "แสดง N จาก M การ์ด" + "ล้างตัวกรอง"
//
// 🔴 อ่าน `filters` จาก prop (คำนวณที่ `BoardView` จาก `searchParams` ที่ server ส่งลงมา) เพื่อให้ตัวเลข
//    นับตรงกับสิ่งที่ `BoardView` กำลังกรองอยู่จริง · ใช้ `useSearchParams`/`useRouter` เองแค่ตอน "แก้ URL"
//    (ลบทีละพารามิเตอร์ / ล้างทั้งหมด) — ลิงก์ที่เหลือ (assignee/label/due/status/q) ยังอยู่ครบเสมอ
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import type { BoardFilters, DueBucket } from "@/lib/modules/kanban/filters";
import type { BoardPersonDto } from "@/lib/modules/kanban/types";

const DUE_LABEL: Record<DueBucket, string> = {
  overdue: "เลยกำหนด",
  today: "วันนี้",
  week: "สัปดาห์นี้",
  none: "ไม่กำหนด",
};

type FilterKey = "assignee" | "label" | "due" | "status" | "q" | "column";

function removeParam(current: URLSearchParams, key: string): string {
  const next = new URLSearchParams(current.toString());
  next.delete(key);
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export function FilterBar({
  filters,
  totalCount,
  visibleCount,
  members,
  columns = [],
}: {
  filters: BoardFilters;
  totalCount: number;
  visibleCount: number;
  members: BoardPersonDto[];
  /** K2.4 — เอาไว้แปล `filters.column` (columnId) เป็นชื่อคอลัมน์ในชิป "คอลัมน์: X" */
  columns?: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const nameOfAssignee = (id: string): string => {
    if (id === "me") return "ฉัน";
    if (id === "none") return "ไม่มีผู้รับผิดชอบ";
    return members.find((m) => m.userId === id)?.name ?? id;
  };
  const nameOfColumn = (id: string): string => columns.find((c) => c.id === id)?.name ?? id;

  const chips: { key: FilterKey; text: string }[] = [];
  if (filters.assignee) chips.push({ key: "assignee", text: `ผู้รับผิดชอบ: ${nameOfAssignee(filters.assignee)}` });
  if (filters.label) chips.push({ key: "label", text: `ป้าย: ${filters.label === "none" ? "ไม่มีป้ายกำกับ" : filters.label}` });
  if (filters.due) chips.push({ key: "due", text: `กำหนดส่ง: ${DUE_LABEL[filters.due]}` });
  if (filters.status) chips.push({ key: "status", text: `สถานะ: ${filters.status === "done" ? "เสร็จ" : "ยังไม่เสร็จ"}` });
  if (filters.q) chips.push({ key: "q", text: `ค้นหา: "${filters.q}"` });
  if (filters.column) chips.push({ key: "column", text: `คอลัมน์: ${nameOfColumn(filters.column)}` });

  if (chips.length === 0) return null;

  const removeOne = (key: FilterKey) => {
    router.replace(`${pathname}${removeParam(searchParams, key)}`, { scroll: false });
  };
  const clearAll = () => {
    router.replace(pathname, { scroll: false });
  };

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-none flex-wrap items-center"
      style={{ gap: 7, padding: "9px 20px", fontSize: 12, color: "var(--color-muted)", borderBottom: "1px solid var(--color-line)" }}
    >
      <KanbanIcon name="filter" size="sm" />
      กรองอยู่:
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center font-semibold"
          style={{
            gap: 5,
            height: 26,
            padding: "0 9px",
            borderRadius: 7,
            border: "1px solid var(--color-accent)",
            background: "var(--color-out)",
            color: "var(--color-accent)",
            fontSize: 12,
          }}
        >
          {c.text}
          <button
            type="button"
            aria-label={`เอาตัวกรอง ${c.text} ออก`}
            onClick={() => removeOne(c.key)}
            className="inline-flex items-center"
            style={{ opacity: 0.65 }}
          >
            <KanbanIcon name="x" size="xs" />
          </button>
        </span>
      ))}
      <span data-testid="filter-count">
        แสดง {visibleCount} จาก {totalCount} การ์ด
      </span>
      <button type="button" data-testid="filter-clear" onClick={clearAll} className="underline" style={{ color: "var(--color-accent)" }}>
        ล้างตัวกรอง
      </button>
      <span className="flex-1" />
      <span className="hidden lg:inline" style={{ opacity: 0.75 }}>
        ลิงก์นี้แชร์ตัวกรองให้ทีมได้ (เก็บไว้ใน URL)
      </span>
    </div>
  );
}

export default FilterBar;
