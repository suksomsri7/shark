// SegmentsList.tsx — รายการ "กลุ่มลูกค้า" ที่บันทึกไว้ (M3.1 · ภาพ 21 ขั้น 1)
//
// คอลัมน์: ชื่อ (+ ประโยคเงื่อนไขย่อบรรทัดล่าง) · จำนวนล่าสุด · ใครเห็น · ผู้สร้าง · ลบ
// ลบได้เฉพาะเจ้าของกลุ่มหรือคนที่มีสิทธิ์จัดการโปรโมชัน (ด่านจริงอยู่ที่ service — ปุ่มแค่ซ่อนให้ไม่ต้องกดเล่น)
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { deleteSegmentAction } from "@/lib/modules/member/segments-actions";

export type SegmentRowView = {
  id: string;
  name: string;
  summary: string;
  lastCount: number | null;
  lastCountAtLabel: string | null;
  scope: "TEAM" | "PRIVATE";
  ownerName: string | null;
  canDelete: boolean;
};

export function SegmentsList({ systemId, rows }: { systemId: string; rows: SegmentRowView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startDelete] = useTransition();

  const remove = (id: string) => {
    setError(null);
    startDelete(async () => {
      const res = await deleteSegmentAction(systemId, id);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="card p-0">
      {error && (
        <p className="px-4 pt-3 text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div data-testid="segments-list" className="flex flex-col">
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            ยังไม่มีกลุ่มลูกค้าที่บันทึกไว้ — กด &ldquo;สร้างกลุ่มลูกค้า&rdquo; เพื่อตั้งเงื่อนไขกลุ่มแรก
          </p>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            data-testid={`segment-row-${r.id}`}
            className="flex flex-col gap-2 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4"
            style={{ borderColor: "var(--color-line)" }}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={`/app/sys/${systemId}/member/segments/${r.id}`} className="truncate text-sm font-medium">
                {r.name}
              </Link>
              <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
                {r.summary}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs sm:justify-end" style={{ color: "var(--color-muted)" }}>
              <span>
                <strong style={{ color: "var(--color-ink)" }}>{r.lastCount === null ? "—" : `${r.lastCount.toLocaleString("th-TH")} คน`}</strong>
                {r.lastCountAtLabel ? ` · นับเมื่อ ${r.lastCountAtLabel}` : ""}
              </span>
              <span className="rounded-lg border px-2 py-0.5" style={{ borderColor: "var(--color-line)" }}>
                {r.scope === "TEAM" ? "ทั้งทีมเห็น" : "เห็นคนเดียว"}
              </span>
              <span className="truncate">{r.ownerName ?? "ระบบ"}</span>
              {r.canDelete && (
                <button type="button" aria-label={`ลบกลุ่ม ${r.name}`} disabled={busy} onClick={() => remove(r.id)} style={{ color: "var(--color-muted)" }}>
                  <MemberIcon name="trash" size="sm" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SegmentsList;
