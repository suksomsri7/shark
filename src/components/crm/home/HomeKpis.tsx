// HomeKpis.tsx — แถว KPI 6 ช่องของหน้าแรก CRM (ใบ C3.2 · ภาพ 01 แถวบน) — คอมโพเนนต์แสดงผลล้วน (server · ไม่มี hook)
// ตัวเลขทั้งหมดมาจาก `crm.home.homeData` ผ่าน `crm/home.tsx` (ระดับรายงานของผู้ดู ∩ การมองเห็นแล้ว) — ไฟล์นี้ไม่คิดอะไรเพิ่ม
// 🔴 ไม่ import โมดูล CRM (ด่าน F2.3) — ชนิดของ props ประกาศที่นี่ · ไม่มีชื่อ/เบอร์/อีเมลของลูกค้า
// 🔴 390 px: 2 คอลัมน์ · ≥ 640 px 3 คอลัมน์ · ≥ 1280 px 6 คอลัมน์ (ภาพ 01) · ป้าย/คำอธิบายยาวตัดด้วย truncate — ตัวเลขห้ามตัด (ย่อขนาดตามช่อง)

import Link from "next/link";
import type { ReactNode } from "react";

export type HomeKpiView = {
  openCount: number;
  openSatang: number;
  weightedSatang: number;
  wonCount: number;
  wonSatang: number;
  targetSatang: number | null;
  wonPct: number | null;
  /** รีวิวรอบ 2 SF-4: ฐานของ % โควตา — "ตามยอดรับชำระ" (PAID) · "ตามยอดชนะ" (WON) */
  basisLabel: string;
  achievedSatang: number;
  winPct: number | null;
  winDeltaPts: number | null;
  closedCount: number;
  staleCount: number;
  staleSatang: number;
  hotCount: number;
  hotThreshold: number;
  /** "เดือนนี้" · "ก.ย. 2569" · "ไตรมาส 3/2569" … */
  periodWord: string;
  /** "เดือนก่อน" · "ไตรมาสก่อน" · "ปีก่อน" */
  prevWord: string;
};

const muted = "text-[color:var(--color-muted)]";

/** ฿4.29M · ฿612K · ฿950 (ภาพ 01) — ปัดลงสองตำแหน่งสำหรับล้าน */
export function compactBaht(satang: number): string {
  const b = Math.round(satang / 100);
  if (Math.abs(b) >= 1_000_000) return `฿${(Math.floor(b / 10_000) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (Math.abs(b) >= 1_000) return `฿${Math.round(b / 1_000).toLocaleString("en-US")}K`;
  return `฿${b.toLocaleString("th-TH")}`;
}
export const fullBaht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  open: "M4 7h16v10H4zM8 11h8",
  weighted: "M5 19 19 5M7 7h.01M17 17h.01",
  won: "M6 21V4M6 4h11l-2 4 2 4H6",
  winrate: "M5 12l4 4L19 6",
  stale: "M12 4 2.5 20h19ZM12 10v4M12 17h.01",
  hot: "M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z",
} as const;

// PARITY 01 (8 ต.ค.): ช่องเป็น container — ตัวเลขย่อตามความกว้างช่อง (ช่องแคบสุด ~120 px ที่จอ 1440) แทนการตัดเป็น "฿19.…"
const TILE = "card @container flex min-w-0 flex-col gap-1.5 p-4 xl:max-2xl:p-3 hover:bg-[color:var(--color-surface-2)]";

/** เนื้อในของช่อง KPI — ตัวลิงก์ (พร้อม data-testid ตรงตัว · ด่าน F14.1 อ่านค่าจากโค้ด) เขียนที่ HomeKpis ทีละช่อง */
function TileBody({ icon, label, value, sub, danger }: { icon: string; label: string; value: string; sub: ReactNode; danger?: boolean }) {
  return (
    <>
      <span className={`flex min-w-0 items-center gap-1.5 text-xs ${muted}`}>
        <Icon d={icon} />
        <span className="truncate">{label}</span>
      </span>
      <span className={`min-w-0 text-[length:clamp(0.75rem,20cqw,1.5rem)] leading-8 font-semibold tabular-nums [overflow-wrap:anywhere] ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</span>
      <span className={`line-clamp-2 min-w-0 text-xs ${muted}`}>{sub}</span>
    </>
  );
}

export function HomeKpis({ k, links }: { k: HomeKpiView; links: { open: string; weighted: string; won: string; winrate: string; stale: string; hot: string } }) {
  const delta = k.winDeltaPts;
  return (
    <section className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="ตัวชี้วัดหลัก">
      <Link href={links.open} className={TILE} data-testid="crm-home-kpi-open">
        <TileBody icon={ICON.open} label="pipeline เปิด" value={compactBaht(k.openSatang)} sub={`${k.openCount.toLocaleString("th-TH")} ดีล`} />
      </Link>
      <Link href={links.weighted} className={TILE} data-testid="crm-home-kpi-weighted">
        <TileBody icon={ICON.weighted} label="ถ่วงน้ำหนัก" value={compactBaht(k.weightedSatang)} sub="ตามความน่าจะเป็นต่อขั้น" />
      </Link>
      <Link href={links.won} className={TILE} data-testid="crm-home-kpi-won">
        <TileBody
          icon={ICON.won}
          label={`ชนะ${k.periodWord}`}
          value={compactBaht(k.wonSatang)}
          sub={k.targetSatang !== null ? `${k.wonPct ?? 0}% ของโควตา ${compactBaht(k.targetSatang)} · ${k.basisLabel} ${compactBaht(k.achievedSatang)}` : `${k.wonCount.toLocaleString("th-TH")} ดีล · ยังไม่ได้ตั้งโควตา`}
        />
      </Link>
      <Link href={links.winrate} className={TILE} data-testid="crm-home-kpi-winrate">
        <TileBody
          icon={ICON.winrate}
          label="อัตราชนะ"
          value={k.winPct === null ? "–" : `${k.winPct}%`}
          sub={k.winPct === null ? "ยังไม่มีดีลที่ปิดในช่วงนี้" : delta === null ? `จาก ${k.closedCount.toLocaleString("th-TH")} ดีลที่ปิด` : `${delta > 0 ? "+" : ""}${delta} จุดจาก${k.prevWord}`}
        />
      </Link>
      <Link href={links.stale} className={TILE} data-testid="crm-home-kpi-stale">
        <TileBody icon={ICON.stale} label="ดีลนิ่ง" value={k.staleCount.toLocaleString("th-TH")} sub={`รวม ${fullBaht(k.staleSatang)}`} danger={k.staleCount > 0} />
      </Link>
      <Link href={links.hot} className={TILE} data-testid="crm-home-kpi-hot">
        <TileBody icon={ICON.hot} label="lead ร้อน" value={k.hotCount.toLocaleString("th-TH")} sub={`คะแนน ≥ ${k.hotThreshold}`} />
      </Link>
    </section>
  );
}
