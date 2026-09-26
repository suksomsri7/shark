"use client";

// ReportFilterBar.tsx — แถบตัวกรองของรายงาน (ภาพ 09: ช่วง · ทีม · Pipeline + หมายเหตุที่มาของตัวเลข)
// 🔴 ไม่ import โมดูล CRM (F2.3 + 'use client') — ตัวเลือกทั้งหมดมาจากหน้า (props) · เปลี่ยนค่า = เปลี่ยน URL (?from=&to=&team=&pipeline=)
// 🔴 390 px: ตัวเลือกห่อบรรทัดได้ · ไม่มีความกว้างตายตัว

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { RvFilterState, RvOption } from "./types";

const selectCls = "input h-9 w-auto min-w-0 max-w-full py-1 text-sm";

export function ReportFilterBar({
  basePath,
  state,
  periods,
  teams,
  pipelines,
}: {
  basePath: string;
  state: RvFilterState;
  /** value = "from|to" · "all" = ทุกช่วงเวลา */
  periods: RvOption[];
  teams: RvOption[];
  pipelines: RvOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (next: RvFilterState) => {
    const q = new URLSearchParams();
    if (next.period === "all") q.set("range", "all");
    else if (next.period) {
      const [from, to] = next.period.split("|");
      if (from) q.set("from", from);
      if (to) q.set("to", to);
    }
    if (next.team) q.set("team", next.team);
    if (next.pipeline) q.set("pipeline", next.pipeline);
    const qs = q.toString();
    start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  };

  return (
    <div className="card flex min-w-0 flex-wrap items-center gap-2 px-3 py-2" data-testid="crm-report-filters" aria-busy={pending}>
      <label className="flex min-w-0 items-center gap-1 text-sm">
        <span className="sr-only">ช่วงเวลา</span>
        <select className={selectCls} value={state.period} onChange={(e) => go({ ...state, period: e.target.value })} data-testid="crm-report-filter-period" aria-label="ช่วงเวลา">
          {periods.map((p) => (
            <option key={p.value} value={p.value}>
              ช่วง: {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-1 text-sm">
        <span className="sr-only">ทีม</span>
        <select className={selectCls} value={state.team} onChange={(e) => go({ ...state, team: e.target.value })} data-testid="crm-report-filter-team" aria-label="ทีม">
          <option value="">ทีม: ทั้งหมด</option>
          {teams.map((t) => (
            <option key={t.value} value={t.value}>
              ทีม: {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-1 text-sm">
        <span className="sr-only">Pipeline</span>
        <select className={selectCls} value={state.pipeline} onChange={(e) => go({ ...state, pipeline: e.target.value })} data-testid="crm-report-filter-pipeline" aria-label="Pipeline">
          <option value="">Pipeline: ทั้งหมด</option>
          {pipelines.map((p) => (
            <option key={p.value} value={p.value}>
              Pipeline: {p.label}
            </option>
          ))}
        </select>
      </label>
      <span className="min-w-0 flex-1 text-xs text-[color:var(--color-muted)] sm:text-right">
        {pending ? "กำลังคำนวณใหม่…" : "คำนวณจาก stage history · activity · commission ledger (ไม่ใช่ตัวนับ cache)"}
      </span>
    </div>
  );
}
