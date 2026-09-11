// JourneysTable.tsx — ตาราง "Journey ที่เปิดใช้อยู่" (M3.3 · ภาพ 07 บน ครึ่งล่างของกล่อง journey)
//
// คอลัมน์ตามภาพ: Journey (ชื่อ + ประโยคย่อ) · ส่งเดือนนี้ · ใช้สิทธิ์ n (%) · ยอดที่เกิด · ต้นทุน · ROI · สถานะ (สวิตช์)
// 🔴 สวิตช์ปิด = ขั้นที่รออยู่ของ journey นั้นถูกยกเลิกทันที (เอนจินทำ) — ปุ่มจึงถามยืนยันก่อนปิดเสมอ
// 🔴 มือถือ: แถวยุบเป็นการ์ด (grid-cols-1) + ทุกช่อง min-w-0 — ตารางกว้างเคยดันจอล้น (บทเรียน M3.2)
// 🔴 client component: import เฉพาะ server action + ไฟล์บริสุทธิ์ (ไม่ลาก prisma เข้าเบราว์เซอร์)
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleJourneyAction } from "@/lib/modules/member/journeys-actions";

export type JourneyRowView = {
  id: string;
  name: string;
  summary: string;
  enabled: boolean;
  sent: number;
  used: number;
  usedPctLabel: string;
  saleLabel: string;
  costLabel: string;
  roiLabel: string;
};

const GRID = "md:grid-cols-[minmax(0,2.6fr)_repeat(5,minmax(0,1fr))_minmax(0,0.8fr)]";

export function JourneysTable({ systemId, rows, canManage }: { systemId: string; rows: JourneyRowView[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.id, r.enabled])));

  const toggle = (r: JourneyRowView) => {
    const next = !(state[r.id] ?? r.enabled);
    if (!next && !window.confirm(`หยุด "${r.name}" ชั่วคราว? ขั้นที่รอส่งอยู่ของ journey นี้จะถูกยกเลิกทั้งหมด`)) return;
    setError(null);
    start(async () => {
      const res = await toggleJourneyAction(systemId, r.id, next);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setState((s) => ({ ...s, [r.id]: res.data.enabled }));
      router.refresh();
    });
  };

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-baseline gap-2 px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Journey ที่เปิดใช้อยู่</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {rows.length.toLocaleString("th-TH")} แบบ · เดือนนี้
        </span>
      </div>
      {error && (
        <p className="px-4 pb-2 text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div data-testid="journeys-table" className="flex min-w-0 flex-col">
        <div className={`hidden gap-3 border-y px-4 py-2 text-xs md:grid ${GRID}`} style={{ borderColor: "var(--color-line)", color: "var(--color-muted)", background: "var(--color-bg)" }}>
          <span>Journey</span>
          <span className="text-right">ส่งเดือนนี้</span>
          <span className="text-right">ใช้สิทธิ์</span>
          <span className="text-right">ยอดที่เกิด</span>
          <span className="text-right">ต้นทุน</span>
          <span className="text-right">ROI</span>
          <span className="text-right">สถานะ</span>
        </div>

        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            ยังไม่มี journey ในระบบสมาชิกนี้ — เริ่มจากสำเร็จรูปด้านบน หรือกด &ldquo;สร้าง Journey ใหม่&rdquo;
          </p>
        )}

        {rows.map((r) => {
          const on = state[r.id] ?? r.enabled;
          return (
            <div
              key={r.id}
              data-testid={`journey-row-${r.id}`}
              className={`grid min-w-0 grid-cols-2 items-center gap-x-3 gap-y-1 border-t px-4 py-3 text-sm ${GRID}`}
              style={{ borderColor: "var(--color-line)", opacity: on ? 1 : 0.6 }}
            >
              <Link href={`/app/sys/${systemId}/member/journeys/${r.id}`} className="col-span-2 flex min-w-0 flex-col md:col-span-1">
                <span className="truncate font-semibold">{r.name}</span>
                <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                  {r.summary}
                  {on ? "" : " · ปิดใช้อยู่"}
                </span>
              </Link>
              <span className="min-w-0 tabular-nums md:text-right">
                <span className="text-xs md:hidden" style={{ color: "var(--color-muted)" }}>ส่ง </span>
                {r.sent.toLocaleString("th-TH")}
              </span>
              <span className="min-w-0 tabular-nums md:text-right">
                <span className="text-xs md:hidden" style={{ color: "var(--color-muted)" }}>ใช้สิทธิ์ </span>
                {r.sent > 0 ? `${r.used.toLocaleString("th-TH")} ${r.usedPctLabel}` : "—"}
              </span>
              <span className="min-w-0 tabular-nums md:text-right">
                <span className="text-xs md:hidden" style={{ color: "var(--color-muted)" }}>ยอด </span>
                {r.saleLabel}
              </span>
              <span className="min-w-0 tabular-nums md:text-right">
                <span className="text-xs md:hidden" style={{ color: "var(--color-muted)" }}>ต้นทุน </span>
                {r.costLabel}
              </span>
              <span className="min-w-0 tabular-nums md:text-right">
                <span className="text-xs md:hidden" style={{ color: "var(--color-muted)" }}>ROI </span>
                {r.roiLabel}
              </span>
              <span className="flex min-w-0 justify-end">
                <button
                  data-testid="journey-toggle"
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={on ? `หยุด ${r.name} ชั่วคราว` : `เปิดใช้ ${r.name}`}
                  disabled={!canManage || busy}
                  onClick={() => toggle(r)}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ background: on ? "var(--color-ink)" : "var(--color-line)" }}
                >
                  <span className="absolute top-0.5 h-5 w-5 rounded-full transition-all" style={{ left: on ? "1.375rem" : "0.125rem", background: "var(--color-surface)" }} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default JourneysTable;
