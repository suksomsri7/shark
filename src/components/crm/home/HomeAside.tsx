// HomeAside.tsx — แถบขวาของหน้าแรก CRM (ใบ C3.2 · ภาพ 01 ขวา): ผู้ช่วย AI (3 ปุ่ม) · ที่มา lead ของงวด · ป้ายเตือนดีลนิ่ง
// server component แสดงผลล้วน · ตัวเลขมาจาก `crm.home.homeData` ผ่าน `crm/home.tsx`
// 🔴 ปุ่ม AI 3 ปุ่ม = "ปุ่มเท่านั้น" ในใบนี้ (ใบ C3.4 เป็นคนต่อสาย — addendum ข้อ 15) ⇒ แสดงเป็นปุ่มปิดพร้อมคำอธิบาย ไม่หลอกว่ากดได้
// 🔴 ไม่ import โมดูล CRM (F2.3) · 390 px: การ์ดเต็มความกว้าง ข้อความยาวตัดด้วย truncate

import Link from "next/link";
import type { ReactNode } from "react";
import { fullBaht } from "./HomeKpis";

export type HomeSourceView = { key: string; label: string; count: number; href: string };

const muted = "text-[color:var(--color-muted)]";

function Svg({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const SPARK = "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z";
const LINK = "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1";
const WARN = "M12 4 2.5 20h19ZM12 10v4M12 17h.01";

/** แถวของผู้ช่วย AI — ปุ่ม (พร้อม data-testid ตรงตัว · ด่าน F14.1) เขียนที่ HomeAside ทีละแถวแล้วส่งมาเป็น children */
function AiRow({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm">{title}</span>
        <span className={`block truncate text-xs ${muted}`}>{sub}</span>
      </span>
      {children}
    </li>
  );
}

const AI_BTN = "btn-sm shrink-0 opacity-60";
const AI_SOON = "ผู้ช่วย AI ส่วนนี้จะเปิดใช้ในรุ่นถัดไป";

export function HomeAside({
  ai,
  sources,
  sourcesTitle,
  stale,
}: {
  ai: { staleCount: number; hotCount: number; hotThreshold: number };
  sources: HomeSourceView[];
  sourcesTitle: string;
  /** null = ไม่มีดีลนิ่ง (ไม่แสดงป้าย) */
  stale: { count: number; satang: number; href: string } | null;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-4" aria-label="ผู้ช่วยและที่มา lead">
      <section className="card flex min-w-0 flex-col gap-1 p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Svg d={SPARK} />
          ผู้ช่วย AI
        </h2>
        <ul className="flex min-w-0 flex-col divide-y">
          <AiRow title="ดีลไหนเสี่ยงเดือนนี้" sub="วิเคราะห์จากประวัติขั้น+กิจกรรม">
            <button type="button" className={AI_BTN} disabled aria-disabled="true" title={AI_SOON} data-testid="crm-home-ai-risk">
              ดู
            </button>
          </AiRow>
          <AiRow title="ร่างอีเมลติดตามดีลนิ่ง" sub={`${ai.staleCount.toLocaleString("th-TH")} ดีล พร้อมส่ง`}>
            <button type="button" className={AI_BTN} disabled aria-disabled="true" title={AI_SOON} data-testid="crm-home-ai-draft">
              ร่าง
            </button>
          </AiRow>
          <AiRow title="สรุป lead ร้อนสัปดาห์นี้" sub={`${ai.hotCount.toLocaleString("th-TH")} คน คะแนน ≥ ${ai.hotThreshold}`}>
            <button type="button" className={AI_BTN} disabled aria-disabled="true" title={AI_SOON} data-testid="crm-home-ai-summary">
              สรุป
            </button>
          </AiRow>
        </ul>
        <p className={`text-xs ${muted}`}>ผู้ช่วย AI ของหน้าแรกกำลังจะเปิดใช้ — ปุ่มจะกดได้เมื่อพร้อม</p>
      </section>

      <section className="card flex min-w-0 flex-col gap-1 p-4" data-testid="crm-home-sources">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Svg d={LINK} />
          {sourcesTitle}
        </h2>
        {sources.length === 0 ? (
          <p className={`py-2 text-sm ${muted}`}>ยังไม่มีผู้ติดต่อใหม่ในช่วงนี้</p>
        ) : (
          <ul className="flex min-w-0 flex-col divide-y">
            {sources.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="flex min-w-0 items-center justify-between gap-3 py-2.5 text-sm" data-testid={`crm-home-source-row-${s.key}`}>
                  <span className="truncate">{s.label}</span>
                  <span className={`shrink-0 rounded-md border px-1.5 text-xs tabular-nums ${muted}`}>{s.count.toLocaleString("th-TH")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stale && (
        <Link
          href={stale.href}
          className="flex min-w-0 items-start gap-2 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-4 text-sm text-[color:var(--color-accent)]"
          data-testid="crm-home-stale-banner"
        >
          <Svg d={WARN} />
          <span className="min-w-0">
            ดีล <b>{stale.count.toLocaleString("th-TH")}</b> รายการนิ่งเกินกำหนด — รวมมูลค่า <b>{fullBaht(stale.satang)}</b>
          </span>
        </Link>
      )}
    </aside>
  );
}
