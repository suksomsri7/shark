// HomeLeaderboard.tsx — "Leaderboard ทีมขาย" ของหน้าแรก CRM (ใบ C3.2 · ภาพ 01 ล่าง) — server component แสดงผลล้วน
// แถว = ขอบเขตรายงานของผู้ดู (ตัวเอง · ทีม · ทั้งร้าน) · ยอดชนะ/ดีลเปิด = เฉพาะดีลที่ผู้ดูเห็น · เป้า = โควตา USER ของงวด
// เรียงมาแล้วจากบริการ (ยอดชนะ ↓ · % ↓ · userId) — ไฟล์นี้ไม่เรียงใหม่
// 🔴 ไม่ import โมดูล CRM (F2.3) · 390 px: ซ่อนคอลัมน์ "โควตา" · แถบความคืบหน้าหดตามพื้นที่ (ไม่มีความกว้างตายตัวที่ดันจอ)

import Link from "next/link";
import { fullBaht } from "./HomeKpis";

export type HomeLeaderRowView = { userId: string; name: string; wonSatang: number; targetSatang: number | null; pct: number | null; openDeals: number; href: string };

const muted = "text-[color:var(--color-muted)]";

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3 2.7-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.4-1.6-4.2-4-4.8" />
    </svg>
  );
}

export function HomeLeaderboard({ rows, periodLabel, basisLabel }: { rows: HomeLeaderRowView[]; periodLabel: string; /** รีวิวรอบ 2 SF-4 ฐานของ % */ basisLabel: string }) {
  return (
    <section className="card flex min-w-0 flex-col gap-0 p-0" data-testid="crm-home-leaderboard">
      <div className="flex min-w-0 items-center gap-2 px-4 py-3">
        <PeopleIcon />
        <h2 className="truncate text-base font-semibold">Leaderboard ทีมขาย</h2>
        <span className={`shrink-0 text-xs ${muted}`}>{periodLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className={`px-4 pb-4 text-sm ${muted}`}>ยังไม่มีพนักงานที่มีดีลหรือโควตาในช่วงนี้</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead className={`bg-[color:var(--color-surface-2)] text-left text-xs ${muted}`}>
            <tr>
              <th className="w-8 px-3 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">พนักงาน</th>
              <th className="w-24 px-2 py-2 text-right font-medium sm:w-28">ชนะ</th>
              <th className="hidden w-28 px-2 py-2 text-right font-medium sm:table-cell">โควตา</th>
              <th className="hidden w-40 px-2 py-2 font-medium md:table-cell">ความคืบหน้า ({basisLabel})</th>
              <th className="w-14 px-3 py-2 text-right font-medium">ดีลเปิด</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={r.userId} data-testid={`crm-home-leaderboard-row-${r.userId}`}>
                <td className={`px-3 py-2.5 tabular-nums ${muted}`}>{i + 1}</td>
                <td className="px-2 py-2.5">
                  <Link href={r.href} className="flex min-w-0 items-center gap-2" data-testid={`crm-home-leaderboard-link-${r.userId}`}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold" aria-hidden="true">
                      {r.name.trim().slice(0, 1) || "?"}
                    </span>
                    <span className="truncate font-semibold">{r.name}</span>
                  </Link>
                  {/* 390 px: % อยู่ใต้ชื่อแทนคอลัมน์ความคืบหน้า */}
                  {r.pct !== null && <span className={`block text-xs md:hidden ${muted}`}>{r.pct}% ของโควตา ({basisLabel})</span>}
                </td>
                <td className="truncate px-2 py-2.5 text-right tabular-nums">{fullBaht(r.wonSatang)}</td>
                <td className={`hidden truncate px-2 py-2.5 text-right tabular-nums sm:table-cell ${muted}`}>{r.targetSatang === null ? "–" : fullBaht(r.targetSatang)}</td>
                <td className="hidden px-2 py-2.5 md:table-cell">
                  {r.pct === null ? (
                    <span className={`text-xs ${muted}`}>ไม่มีโควตา</span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-line)]" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: r.pct >= 80 ? "var(--color-ink)" : "var(--color-muted)" }} />
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums">{r.pct}%</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.openDeals.toLocaleString("th-TH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
