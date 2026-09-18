"use client";

// บล็อก "กิจกรรมและโน้ต" ของหน้า 360 (ผู้ติดต่อ · บริษัท · ดีล — CRM v2 · ใบ C1.6 · มติ C19)
// ตัวห่อฝั่งเซิร์ฟเวอร์อยู่ที่ `src/components/crm/activity/CrmActivityBlock.tsx` (ดึงข้อมูลผ่าน facade `@/lib/modules/crm`)
// 🔴 ไฟล์ client: import ได้เฉพาะ activities-shared (บริสุทธิ์) + server actions

import Link from "next/link";
import { useState } from "react";
import type { ActivityListItem, ActivityType, MentionOption } from "@/lib/modules/crm/activities-shared";
import { LogActivityForm, type ActivityTarget } from "./LogActivityForm";
import { ActivityRow } from "./ActivityItems";

export function ActivityPanel({
  systemId,
  target,
  items,
  notes,
  outcomes,
  mentionOptions,
  boards,
  currentUserId,
  canManage,
  canLog,
  canComplete,
  allHref,
}: {
  systemId: string;
  target: ActivityTarget;
  items: ActivityListItem[];
  notes: ActivityListItem[];
  outcomes: Partial<Record<ActivityType, string[]>>;
  mentionOptions: MentionOption[];
  boards: { id: string; name: string }[];
  currentUserId: string;
  canManage: boolean;
  canLog: boolean;
  canComplete: boolean;
  /** ลิงก์ "ดูทั้งหมด" → หน้ากิจกรรมที่กรองเฉพาะระเบียนนี้ */
  allHref: string;
}) {
  const [tab, setTab] = useState<"activities" | "notes">("activities");
  const [open, setOpen] = useState<null | ActivityType>(null);
  const list = tab === "notes" ? notes : items.filter((i) => i.type !== "NOTE");
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-activity-block">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          กิจกรรมและโน้ต
          <Link href={allHref} className="text-xs font-normal underline" data-testid="crm-activity-all">
            ดูทั้งหมด
          </Link>
        </h2>
        {canLog && (
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(open === "NOTE" ? null : "NOTE")} data-testid="crm-activity-add-note">
              + โน้ต
            </button>
            <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(open && open !== "NOTE" ? null : "CALL")} data-testid="crm-activity-add">
              + บันทึกกิจกรรม
            </button>
          </div>
        )}
      </div>
      {open && canLog && (
        <div className="rounded-lg border p-3">
          <LogActivityForm key={open} systemId={systemId} target={target} outcomes={outcomes} mentionOptions={mentionOptions} defaultType={open} onDone={() => setOpen(null)} />
        </div>
      )}
      <nav className="flex gap-1 border-b pb-px" aria-label="แท็บกิจกรรม">
        {(
          [
            ["activities", `กิจกรรม (${items.filter((i) => i.type !== "NOTE").length})`],
            ["notes", `โน้ต (${notes.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="px-3 py-1.5 text-sm"
            style={tab === k ? { borderBottom: "2px solid var(--color-accent)", fontWeight: 700 } : { color: "var(--color-muted)" }}
            onClick={() => setTab(k)}
            data-testid={`crm-activity-tab-${k}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {list.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">{tab === "notes" ? "ยังไม่มีโน้ต — กด \"+ โน้ต\" เพื่อจดสิ่งที่ทีมควรรู้" : "ยังไม่มีกิจกรรม — กด \"+ บันทึกกิจกรรม\" หลังโทร นัดพบ หรือส่งงาน"}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {list.map((i) => (
            <ActivityRow key={i.id} systemId={systemId} item={i} currentUserId={currentUserId} canManage={canManage} boards={boards} canComplete={canComplete} />
          ))}
        </ul>
      )}
    </section>
  );
}
