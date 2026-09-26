"use client";

// ReportScheduleButton.tsx — ปุ่ม "ตั้งเวลาส่งอีเมล" + หน้าต่างตั้งตารางส่งรายงาน (ภาพ 09 มุมขวาบน · addendum ข้อ 9–10)
// 🔴 แสดงเฉพาะคนที่มีคีย์ `crm.report.all` (หน้าตัดสินแล้วส่งมา) · บริการตรวจซ้ำเสมอ
// 🔴 ผู้รับเลือกได้เฉพาะพนักงานของร้าน (รายชื่อจากหน้า) — ไม่มีช่องพิมพ์อีเมลภายนอก
// 🔴 ข้อความผิดพลาดแสดงในหน้าต่าง (ไม่ใช้ alert) · ไม่ import โมดูล CRM (F2.3)

import { useState } from "react";
import { deleteCrmReportScheduleAction, saveCrmReportScheduleAction } from "@/app/app/sys/[id]/crm/reports/reports-actions";
import type { RvSchedulePanel, RvScheduleRow } from "./types";

const selectCls = "input h-9 py-1 text-sm";

export function ReportScheduleButton({
  systemId,
  currentTab,
  filters,
  panel,
}: {
  systemId: string;
  currentTab: string;
  filters: Record<string, string>;
  panel: RvSchedulePanel;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RvScheduleRow[]>(panel.schedules);
  const [tab, setTab] = useState(currentTab);
  const [frequency, setFrequency] = useState("WEEKLY");
  const [weekday, setWeekday] = useState(1);
  const [day, setDay] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    setError(null);
    setNotice(null);
    if (picked.length === 0) {
      setError("เลือกผู้รับรายงานอย่างน้อย 1 คน");
      return;
    }
    setBusy(true);
    try {
      const r = await saveCrmReportScheduleAction(systemId, { tab, frequency, weekday, dayOfMonth: day, recipientUserIds: picked, filters });
      if (!r.ok) setError(r.error);
      else {
        setRows(r.value);
        setPicked([]);
        setNotice("บันทึกตารางส่งรายงานแล้ว — ระบบจะส่งอีเมลพร้อมไฟล์ CSV ตามรอบที่ตั้งไว้");
      }
    } catch {
      setError("บันทึกไม่สำเร็จเพราะการเชื่อมต่อขัดข้อง — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const r = await deleteCrmReportScheduleAction(systemId, id);
      if (!r.ok) setError(r.error);
      else {
        setRows(r.value);
        setNotice("ลบตารางส่งรายงานแล้ว");
      }
    } catch {
      setError("ลบไม่สำเร็จเพราะการเชื่อมต่อขัดข้อง — ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn-sm" onClick={() => setOpen(true)} data-testid="crm-report-schedule">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        ตั้งเวลาส่งอีเมล
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-report-schedule-title"
            className="flex max-h-[90vh] w-full min-w-0 max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 sm:rounded-2xl"
            data-testid="crm-report-schedule-modal"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="crm-report-schedule-title" className="text-base font-semibold">
                  ตั้งเวลาส่งรายงานทางอีเมล
                </h2>
                <p className="text-xs text-[color:var(--color-muted)]">ผู้รับแต่ละคนได้ตัวเลขตามสิทธิ์การมองเห็นของตัวเอง · แนบไฟล์ CSV ทุกฉบับ</p>
              </div>
              <button type="button" className="btn-sm" onClick={() => setOpen(false)} aria-label="ปิดหน้าต่าง" data-testid="crm-report-schedule-close">
                ✕
              </button>
            </div>

            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-sm font-medium">ตารางที่ตั้งไว้</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีตารางส่งรายงาน</p>
              ) : (
                <ul className="flex min-w-0 flex-col divide-y rounded-lg border">
                  {rows.map((s) => (
                    <li key={s.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {s.tabLabel} · {s.frequencyLabel} ({s.whenLabel}) · ผู้รับ {s.recipients} คน
                      </span>
                      <button type="button" className="btn-sm shrink-0 text-[color:var(--color-danger)]" disabled={busy} onClick={() => remove(s.id)} data-testid={`crm-report-schedule-delete-${s.id}`}>
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex min-w-0 flex-col gap-3">
              <h3 className="text-sm font-medium">เพิ่มตาราง</h3>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1 text-sm">
                  แท็บรายงาน
                  <select className={selectCls} value={tab} onChange={(e) => setTab(e.target.value)} data-testid="crm-report-schedule-tab">
                    {panel.tabs.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm">
                  ความถี่
                  <select className={selectCls} value={frequency} onChange={(e) => setFrequency(e.target.value)} data-testid="crm-report-schedule-frequency">
                    {panel.frequencies.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                {frequency === "WEEKLY" && (
                  <label className="flex min-w-0 flex-col gap-1 text-sm">
                    ส่งทุกวัน
                    <select className={selectCls} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} data-testid="crm-report-schedule-weekday">
                      {panel.weekdays.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {frequency === "MONTHLY" && (
                  <label className="flex min-w-0 flex-col gap-1 text-sm">
                    ส่งทุกวันที่
                    <select className={selectCls} value={day} onChange={(e) => setDay(Number(e.target.value))} data-testid="crm-report-schedule-day">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <fieldset className="flex min-w-0 flex-col gap-1">
                <legend className="text-sm">ผู้รับ (พนักงานของร้าน)</legend>
                <div className="flex max-h-44 min-w-0 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                  {panel.staff.map((s) => (
                    <label key={s.value} className="flex min-w-0 items-center gap-2 text-sm">
                      <input type="checkbox" checked={picked.includes(s.value)} onChange={() => toggle(s.value)} data-testid={`crm-report-schedule-recipient-${s.value}`} />
                      <span className="min-w-0 truncate">{s.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-xs text-[color:var(--color-muted)]">ใช้ตัวกรองทีม/pipeline ของหน้านี้ · ช่วงข้อมูลในอีเมล = วันก่อน / สัปดาห์ก่อน / เดือนก่อน ตามความถี่</p>
              {error && (
                <p className="text-sm text-[color:var(--color-danger)]" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="text-sm text-[color:var(--color-muted)]" aria-live="polite">
                  {notice}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={save} data-testid="crm-report-schedule-save">
                  {busy ? "กำลังบันทึก…" : "บันทึกตาราง"}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
