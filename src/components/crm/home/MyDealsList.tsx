"use client";

// MyDealsList.tsx — "ดีลของฉัน" บนหน้าแรก CRM v2 (ใบ C1.11 · ภาพ 13(ก)): ชิปกรองตามขั้น + การ์ดดีล (ป้ายนิ่ง N วัน · ขั้น · ชื่อ · บริษัท · มูลค่า)
// 🔴 ไฟล์ client: ไม่ import โมดูลที่ถึง prisma — ข้อมูลทั้งหมดมาทาง props จากหน้า server (ผ่านการมองเห็นแล้ว)
// 🔴 390 px: การ์ดเต็มความกว้าง · ชิปเลื่อนแนวนอนในแถวของตัวเอง (ไม่ดันหน้ากว้างเกินจอ)

import Link from "next/link";
import { useMemo, useState } from "react";

export type MyDealCard = {
  id: string;
  title: string;
  valueSatang: number;
  stageId: string;
  stageName: string;
  companyName: string | null;
  /** เช่น "นิ่ง 21 วัน" — null = ไม่นิ่ง */
  staleLabel: string | null;
};

const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

export function MyDealsList({ systemId, deals, stages }: { systemId: string; deals: MyDealCard[]; stages: { id: string; name: string }[] }) {
  const [stage, setStage] = useState<string>("");
  const shown = useMemo(() => (stage ? deals.filter((d) => d.stageId === stage) : deals), [deals, stage]);
  const count = (id: string) => deals.filter((d) => d.stageId === id).length;
  const chip = (active: boolean) =>
    `shrink-0 rounded-lg border px-3 py-1 text-xs ${active ? "border-[color:var(--color-ink)] font-semibold" : "text-[color:var(--color-muted)]"}`;

  if (deals.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีดีลที่เปิดอยู่ในความดูแลของคุณ</p>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="กรองตามขั้น">
        <button type="button" role="tab" aria-selected={stage === ""} className={chip(stage === "")} onClick={() => setStage("")} data-testid="crm-home-stage-all">
          ทั้งหมด {deals.length}
        </button>
        {stages.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={stage === s.id} className={chip(stage === s.id)} onClick={() => setStage(s.id)} data-testid="crm-home-stage-chip">
            {s.name} {count(s.id)}
          </button>
        ))}
      </div>
      <ul className="flex min-w-0 flex-col gap-3">
        {shown.map((d) => (
          <li key={d.id}>
            <Link
              href={`/app/sys/${systemId}/crm/deals/${d.id}`}
              className={`card flex min-w-0 flex-col gap-1 p-4 ${d.staleLabel ? "border-[color:var(--color-danger)]" : ""}`}
              data-testid="crm-home-deal-card"
            >
              <span className="flex flex-wrap items-center gap-2 text-xs">
                {d.staleLabel && <span className="rounded-md border border-[color:var(--color-danger)] px-1.5 py-0.5 text-[color:var(--color-danger)]">{d.staleLabel}</span>}
                <span className="text-[color:var(--color-muted)]">{d.stageName}</span>
              </span>
              <span className="truncate text-sm font-semibold">{d.title}</span>
              {d.companyName && <span className="truncate text-xs text-[color:var(--color-muted)]">{d.companyName}</span>}
              <span className="text-sm font-semibold tabular-nums">{baht(d.valueSatang)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
