"use client";

// ReportExportButton.tsx — ปุ่ม "ส่งออก CSV" ของรายงาน (ภาพ 09 มุมขวาบน · addendum ข้อ 7)
// ส่งออก = งาน async เสมอ: ขอ → ได้ jobId → ถามสถานะเป็นระยะ → DONE แล้วดาวน์โหลด
// 🔴 ชั้นดาวน์โหลด (ไฟล์นี้) เติม BOM "\uFEFF" + ชนิด text/csv ให้ Excel อ่านภาษาไทยถูก — CSV จากบริการไม่มี BOM
// 🔴 ข้อความผิดพลาดแสดงในบรรทัด (ไม่ใช้ alert) · ไม่ import โมดูล CRM (F2.3)

import { useState } from "react";
import { getCrmReportExportAction, startCrmReportExportAction } from "@/app/app/sys/[id]/crm/reports/reports-actions";

const POLL_MS = 1_500;
const POLL_MAX = 80;

function download(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ReportExportButton({ systemId, tab, filters }: { systemId: string; tab: string; filters: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setNote("กำลังเตรียมไฟล์…");
    try {
      const st = await startCrmReportExportAction(systemId, tab, filters);
      if (!st.ok) {
        setError(st.error);
        setNote(null);
        return;
      }
      for (let i = 0; i < POLL_MAX; i += 1) {
        const r = await getCrmReportExportAction(systemId, st.value.jobId);
        if (!r.ok) {
          setError(r.error);
          setNote(null);
          return;
        }
        if (r.value.status === "DONE" && r.value.csv !== null) {
          download(r.value.csv, r.value.filename ?? `crm-report-${tab}.csv`);
          setNote("ดาวน์โหลดแล้ว");
          return;
        }
        if (r.value.status === "FAILED") {
          setError(r.value.error ?? "สร้างไฟล์ไม่สำเร็จ — กดส่งออกใหม่อีกครั้ง");
          setNote(null);
          return;
        }
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
      setNote("ไฟล์ยังไม่เสร็จ — ระบบทำต่อเบื้องหลัง กดส่งออกอีกครั้งในอีกสักครู่");
    } catch {
      setError("ส่งออกไม่สำเร็จเพราะการเชื่อมต่อขัดข้อง — ลองใหม่อีกครั้ง");
      setNote(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <button type="button" className="btn-sm" onClick={run} disabled={busy} data-testid="crm-report-export">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {busy ? "กำลังส่งออก…" : "ส่งออก CSV"}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-[color:var(--color-danger)]" role="alert" data-testid="crm-report-export-error">
          {error}
        </p>
      ) : note ? (
        <p className="max-w-xs text-right text-xs text-[color:var(--color-muted)]" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>
  );
}
