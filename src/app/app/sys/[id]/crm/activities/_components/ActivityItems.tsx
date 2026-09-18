"use client";

// แถวกิจกรรม/โน้ต (CRM v2 · ใบ C1.6) — ใช้ร่วมกันในหน้ากิจกรรม และบล็อกกิจกรรม/โน้ตของหน้า 360 (ผู้ติดต่อ · บริษัท · ดีล)
// ปุ่ม: ปิดงาน · เลื่อนนัด · ปักหมุด (โน้ต) · เปิดการ์ดงานบนบอร์ด · ลบ (ติ๊กยืนยัน + เหตุผล ≥ 5 — X9)
// 🔴 ไฟล์ client: import ได้เฉพาะ activities-shared (บริสุทธิ์) + server actions · ข้อผิดพลาดแสดงในแถว ไม่ใช้ alert()

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_REASON_MIN,
  ACTIVITY_TYPE_LABEL,
  durationLabel,
  isoToThaiLocalInput,
  thaiDateLabel,
  thaiLocalInputToIso,
  thaiTimeLabel,
  type ActivityListItem,
} from "@/lib/modules/crm/activities-shared";
import { completeActivityAction, deleteActivityAction, openTaskCardAction, rescheduleActivityAction, setPinnedAction } from "./actions";

type Board = { id: string; name: string };

const when = (a: ActivityListItem): string => {
  const at = a.startAt ?? a.dueAt ?? a.createdAt;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? `${thaiDateLabel(ms)} ${thaiTimeLabel(ms)}` : "";
};

export function ActivityRow({
  systemId,
  item,
  currentUserId,
  canManage,
  boards = [],
  showTarget = false,
  canComplete = true,
}: {
  systemId: string;
  item: ActivityListItem;
  currentUserId: string;
  canManage: boolean;
  boards?: Board[];
  showTarget?: boolean;
  /** มีสิทธิ์ crm.activity.complete ไหม (ไม่มี = ซ่อนปุ่มปิดงาน — มติผู้คุมงาน C1.6 S10) */
  canComplete?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"" | "delete" | "reschedule" | "card">("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [due, setDue] = useState(isoToThaiLocalInput(item.dueAt ?? item.startAt));
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const mine = item.ownerUserId === currentUserId;
  const canEdit = canManage || mine;
  const overdue = !item.doneAt && item.dueAt && Date.parse(item.dueAt) < Date.now();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMode("");
      router.refresh();
    });

  return (
    <li className="flex flex-col gap-1 py-2" data-testid="activity-row">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-1 text-sm">
            <span className="rounded-md border px-1.5 text-[11px]">{ACTIVITY_TYPE_LABEL[item.type]}</span>
            {item.pinned && <span className="text-[11px]" style={{ color: "var(--color-accent)" }}>ปักหมุด</span>}
            <span className="min-w-0 break-words font-medium">{item.title}</span>
          </span>
          <span className="text-xs text-[color:var(--color-muted)]">
            {when(item)}
            {item.outcome ? ` · ${item.outcome}` : ""}
            {item.durationSec ? ` · ${durationLabel(item.durationSec)}` : ""}
            {item.ownerName ? ` · ${item.ownerName}` : ""}
            {item.doneAt ? " · เสร็จแล้ว" : overdue ? " · เลยกำหนด" : ""}
          </span>
          {showTarget && (item.dealTitle || item.contactName || item.companyName) && (
            <span className="text-xs">
              {item.dealId && item.dealTitle ? (
                <Link className="underline" href={`/app/sys/${systemId}/crm/deals/${item.dealId}`} data-testid="activity-row-deal-link">
                  {item.dealTitle}
                </Link>
              ) : item.contactId && item.contactName ? (
                <Link className="underline" href={`/app/sys/${systemId}/crm/contacts/${item.contactId}`} data-testid="activity-row-contact-link">
                  {item.contactName}
                </Link>
              ) : item.companyId && item.companyName ? (
                <Link className="underline" href={`/app/sys/${systemId}/crm/companies/${item.companyId}`} data-testid="activity-row-company-link">
                  {item.companyName}
                </Link>
              ) : null}
            </span>
          )}
          {item.body && <p className="whitespace-pre-wrap break-words text-sm text-[color:var(--color-muted)]">{item.body}</p>}
        </div>
        <div className="flex flex-wrap gap-1 sm:shrink-0 sm:justify-end">
          {item.type === "NOTE" && canEdit && (
            <button type="button" className="btn btn-ghost text-xs" disabled={pending} onClick={() => run(() => setPinnedAction(systemId, item.id, !item.pinned))} data-testid="activity-row-pin" aria-label={item.pinned ? "ถอดหมุดโน้ต" : "ปักหมุดโน้ต"}>
              {item.pinned ? "ถอดหมุด" : "ปักหมุด"}
            </button>
          )}
          {!item.doneAt && item.type !== "NOTE" && canComplete && (
            <button type="button" className="btn btn-ghost text-xs" disabled={pending} onClick={() => run(() => completeActivityAction(systemId, item.id))} data-testid="activity-row-complete">
              ปิดงาน
            </button>
          )}
          {!item.doneAt && item.type !== "NOTE" && canEdit && (
            <button type="button" className="btn btn-ghost text-xs" disabled={pending} onClick={() => setMode(mode === "reschedule" ? "" : "reschedule")} data-testid="activity-row-reschedule">
              เลื่อน
            </button>
          )}
          {boards.length > 0 && !item.kanbanCardId && item.type !== "NOTE" && (
            <button type="button" className="btn btn-ghost text-xs" disabled={pending} onClick={() => setMode(mode === "card" ? "" : "card")} data-testid="activity-row-card">
              เปิดการ์ดงาน
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-ghost text-xs" disabled={pending} onClick={() => setMode(mode === "delete" ? "" : "delete")} data-testid="activity-row-delete" aria-label="ลบกิจกรรม">
              ลบ
            </button>
          )}
        </div>
      </div>

      {mode === "reschedule" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เวลาใหม่
            <input type="datetime-local" className="input text-sm" value={due} onChange={(ev) => setDue(ev.target.value)} data-testid="activity-row-reschedule-at" />
          </label>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={pending}
            onClick={() => {
              const at = thaiLocalInputToIso(due);
              if (!at) {
                setError("เลือกวันและเวลาใหม่ก่อน");
                return;
              }
              run(() => rescheduleActivityAction(systemId, item.id, item.startAt && !item.dueAt ? { startAt: at } : { dueAt: at }));
            }}
            data-testid="activity-row-reschedule-save"
          >
            บันทึกเวลาใหม่
          </button>
        </div>
      )}

      {mode === "card" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            บอร์ดงาน
            <select className="input text-sm" value={boardId} onChange={(ev) => setBoardId(ev.target.value)} data-testid="activity-row-card-board">
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary text-xs" disabled={pending || !boardId} onClick={() => run(() => openTaskCardAction(systemId, item.id, boardId))} data-testid="activity-row-card-open">
            เปิดการ์ด
          </button>
        </div>
      )}

      {mode === "delete" && (
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เหตุผลที่ลบ (อย่างน้อย {ACTIVITY_REASON_MIN} ตัวอักษร)
            <input className="input text-sm" value={reason} onChange={(ev) => setReason(ev.target.value)} data-testid="activity-row-delete-reason" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(ev) => setConfirm(ev.target.checked)} data-testid="activity-row-delete-confirm" />
            ยืนยันลบกิจกรรมนี้ (กู้คืนไม่ได้)
          </label>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            style={{ color: "var(--color-danger)" }}
            disabled={pending || !confirm || reason.trim().length < ACTIVITY_REASON_MIN}
            onClick={() => run(() => deleteActivityAction(systemId, item.id, { confirm, reason: reason.trim() }))}
            data-testid="activity-row-delete-submit"
          >
            ลบกิจกรรม
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
