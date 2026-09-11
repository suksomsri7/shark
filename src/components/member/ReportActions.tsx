// ReportActions.tsx — ปุ่มหัวหน้ารายงาน: "ส่งออก CSV" + "ตั้งเวลาส่งอีเมลรายงาน" (โมดัล) · M3.8 · ภาพ 25 มุมขวาบน
// testid `reports-export` · `reports-schedule` · `reports-schedule-form`
//
// 🔴 'use client' — import ได้เฉพาะไฟล์บริสุทธิ์ (`reports-shared.ts`) + server action (`reports-actions.ts`)
//    ห้ามลากไฟล์ที่ถึง prisma เข้ามา (tsc ผ่านแต่ next build พัง — บทเรียน M3.1)
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "@/components/member/MemberIcon";
import { exportReportCsvAction, saveReportScheduleAction } from "@/lib/modules/member/reports-actions";
import {
  REPORT_SCHEDULE_MAX_EMAILS,
  REPORT_TABS,
  REPORT_TAB_LABELS,
  type ReportSchedule,
  type ReportTab,
} from "@/lib/modules/member/reports-shared";

const MUTED = "var(--color-muted)";

function thaiDateText(key: string | null): string {
  if (!key) return "ยังไม่เคยส่ง";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 5));
  return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

export function ReportActions({
  systemId,
  tab,
  schedule,
}: {
  systemId: string;
  tab: ReportTab;
  /** null = ผู้ใช้ไม่มีสิทธิ์ตั้งค่า → ไม่โชว์ปุ่มตั้งเวลา */
  schedule: ReportSchedule | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const onExport = () => {
    setError(null);
    start(async () => {
      const r = await exportReportCsvAction(systemId, tab);
      if (!r.ok || !r.data) {
        setError(r.ok ? "ส่งออก CSV ไม่สำเร็จ — ลองใหม่อีกครั้ง" : r.reason);
        return;
      }
      const blob = new Blob([r.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" data-testid="reports-export" className="btn btn-ghost" onClick={onExport} disabled={pending}>
          <MemberIcon name="out" size="sm" />
          {pending ? "กำลังเตรียมไฟล์…" : "ส่งออก CSV"}
        </button>
        {schedule && (
          <button type="button" data-testid="reports-schedule" className="btn btn-ghost" onClick={() => setOpen(true)}>
            <MemberIcon name="mail" size="sm" />
            ตั้งเวลาส่งอีเมลรายงาน
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-[360px] text-right text-xs break-words" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      {open && schedule && <ScheduleModal systemId={systemId} initial={schedule} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ScheduleModal({ systemId, initial, onClose }: { systemId: string; initial: ReportSchedule; onClose: () => void }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [emails, setEmails] = useState(initial.emails.join(", "));
  const [hour, setHour] = useState(String(initial.hour));
  const [tabs, setTabs] = useState<ReportTab[]>(initial.tabs);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const toggleTab = (t: ReportTab) => setTabs((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : REPORT_TABS.filter((x) => x === t || cur.includes(x))));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const list = emails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    start(async () => {
      const r = await saveReportScheduleAction(systemId, { enabled, emails: list, hour: Number(hour), tabs });
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      setSaved(true);
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <form
        data-testid="reports-schedule-form"
        role="dialog"
        aria-modal="true"
        aria-label="ตั้งเวลาส่งอีเมลรายงาน"
        onSubmit={onSubmit}
        className="relative flex max-h-[90vh] w-full max-w-[460px] min-w-0 flex-col gap-4 overflow-y-auto rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-[15px] font-bold">ตั้งเวลาส่งอีเมลรายงาน</h2>
            <p className="text-xs break-words" style={{ color: MUTED }}>
              ส่งสรุป KPI พร้อมไฟล์ CSV ของแท็บที่เลือก วันละ 1 ครั้งตามเวลาไทย
            </p>
          </div>
          <button type="button" className="btn btn-ghost px-2 py-1" onClick={onClose} aria-label="ปิด">
            <MemberIcon name="x" size="sm" />
          </button>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">ส่งอัตโนมัติ</span>
            <span className="text-xs" style={{ color: MUTED }}>
              ส่งล่าสุด: {thaiDateText(initial.lastSentDate)}
            </span>
          </span>
          <button
            type="button"
            data-testid="reports-schedule-enabled"
            role="switch"
            aria-checked={enabled}
            aria-label="ส่งอีเมลรายงานอัตโนมัติ"
            onClick={() => setEnabled((v) => !v)}
            className="shrink-0 rounded-full px-3 py-1 text-xs"
            style={{
              border: "1px solid var(--color-line)",
              background: enabled ? "var(--color-ink)" : "var(--color-surface-2)",
              color: enabled ? "var(--color-surface)" : "var(--color-muted)",
            }}
          >
            {enabled ? "เปิดอยู่" : "ปิดอยู่"}
          </button>
        </div>

        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium">อีเมลผู้รับ (สูงสุด {REPORT_SCHEDULE_MAX_EMAILS} อีเมล)</span>
          <textarea
            data-testid="reports-schedule-emails"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
            className="input"
            placeholder="owner@shop.com, account@shop.com"
          />
          <span className="text-xs" style={{ color: MUTED }}>
            คั่นหลายอีเมลด้วยเครื่องหมายจุลภาคหรือขึ้นบรรทัดใหม่
          </span>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium">เวลาที่ส่ง (เวลาไทย)</span>
          <select data-testid="reports-schedule-hour" value={hour} onChange={(e) => setHour(e.target.value)} className="input">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00 น.
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex min-w-0 flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">แนบไฟล์ CSV ของแท็บ</legend>
          <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
            {REPORT_TABS.map((t) => (
              <label key={t} className="flex min-w-0 items-center gap-2">
                <input type="checkbox" data-testid={`reports-schedule-tab-${t}`} checked={tabs.includes(t)} onChange={() => toggleTab(t)} />
                <span className="truncate">{REPORT_TAB_LABELS[t]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-xs break-words" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        {saved && (
          <p className="text-xs" style={{ color: MUTED }}>
            บันทึกแล้ว
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" data-testid="reports-schedule-save" className="btn btn-primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ReportActions;
