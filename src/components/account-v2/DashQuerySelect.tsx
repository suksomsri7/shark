"use client";

import { useRouter } from "next/navigation";
import { buildHref, type QueryLike } from "./url";

// select ตัวกรองของหน้าหลัก (ปี ▾ / เดือน ▾ / ชนิดเอกสาร ▾) — เปลี่ยนแล้ว push query string ใหม่ทันที
// (auto-submit ไม่ต้องมีปุ่ม "ดู" แยก ตาม f1 ที่วาดเป็นเม็ดเดียว "ปี 2026 ▾")
export function DashQuerySelect({
  name,
  value,
  options,
  basePath,
  currentQuery,
  testId,
  ariaLabel,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  basePath: string;
  currentQuery: QueryLike;
  testId?: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        data-testid={testId}
        className="border-0 bg-transparent py-0.5 pr-1 text-sm outline-none"
        onChange={(e) => router.push(buildHref(basePath, currentQuery, { [name]: e.target.value }))}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default DashQuerySelect;
