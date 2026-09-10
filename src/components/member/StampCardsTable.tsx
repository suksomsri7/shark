// StampCardsTable.tsx — ตาราง "สแตมป์การ์ดทั้งหมด" (M2.3 · ภาพ 17 ครึ่งล่าง)
//
// คอลัมน์ตามภาพ: ชื่อ (+ คำอธิบายบรรทัดล่าง) · ช่อง · ใบที่ใช้อยู่ · ครบแล้ว · สถานะ (สวิตช์)
// สวิตช์สถานะกดได้เฉพาะคนที่มีสิทธิ์จัดการ — คนอื่นเห็นสถานะแต่กดไม่ได้ (พนักงานต้องรู้ว่าใบไหนยังใช้อยู่)
// ป้ายไทยของกฎมาจากทะเบียนเดียวใน `StampCardEditor` (ไม่ฮาร์ดโค้ดซ้ำใน JSX)
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StampCardDto } from "@/lib/modules/stamp/service";
import { toggleStampCardAction } from "@/lib/modules/stamp/stamp-actions";
import { RULE_LABEL } from "./StampCardEditor";

export type StampCardsTableProps = {
  systemId: string;
  rows: StampCardDto[];
  canManage: boolean;
};

export function StampCardsTable({ systemId, rows, canManage }: StampCardsTableProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (cardId: string, active: boolean) => {
    setBusy(cardId);
    setError(null);
    const res = await toggleStampCardAction({ systemId, cardId, active });
    setBusy(null);
    if (!res.ok) setError(res.reason);
    else router.refresh();
  };

  return (
    <div className="card p-0">
      <div className="flex items-center gap-2 p-4 pb-3">
        <h2 className="text-sm font-semibold">สแตมป์การ์ดทั้งหมด</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {rows.length.toLocaleString("th-TH")} ใบ
        </span>
      </div>
      {error && (
        <p className="px-4 pb-2 text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table data-testid="stamps-table" className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--color-muted)", fontSize: 12 }}>
              <th className="px-4 py-2 text-left font-normal">ชื่อ</th>
              <th className="px-4 py-2 text-right font-normal">ช่อง</th>
              <th className="px-4 py-2 text-right font-normal">ใบที่ใช้อยู่</th>
              <th className="px-4 py-2 text-right font-normal">ครบแล้ว</th>
              <th className="px-4 py-2 text-left font-normal">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                  ยังไม่มีสแตมป์การ์ดในระบบ — กด &ldquo;สร้างสแตมป์การ์ด&rdquo; เพื่อออกใบแรก
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} data-testid={`stamps-row-${c.id}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                <td className="px-4 py-3">
                  <Link href={`/app/sys/${systemId}/member/stamps/${c.id}`} className="font-medium">
                    {c.name}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {c.description ?? RULE_LABEL[c.ruleKind] ?? c.ruleKind}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{c.slots}</td>
                <td className="px-4 py-3 text-right">{c.stats.active.toLocaleString("th-TH")}</td>
                <td className="px-4 py-3 text-right">{c.stats.completed.toLocaleString("th-TH")}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.active}
                    aria-label={c.active ? "เปิดใช้งานอยู่" : "ปิดใช้งานอยู่"}
                    data-testid={`stamps-toggle-${c.id}`}
                    disabled={!canManage || busy === c.id}
                    onClick={() => void toggle(c.id, !c.active)}
                    className="inline-flex h-6 w-11 items-center rounded-full p-0.5"
                    style={{
                      border: "1px solid var(--color-line)",
                      background: c.active ? "var(--color-ink)" : "var(--color-surface-2)",
                      justifyContent: c.active ? "flex-end" : "flex-start",
                    }}
                  >
                    <span
                      className="block h-4.5 w-4.5 rounded-full"
                      style={{
                        width: 18,
                        height: 18,
                        background: c.active ? "var(--color-surface)" : "var(--color-muted)",
                      }}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
