"use client";

// PrivacySettings.tsx — ส่วน "อายุเก็บข้อมูล · ส่งออกทั้งระบบ" ของหน้า /crm/settings (CRM v2 · ใบ C3.9)
//   • อายุไฟล์ส่งออก (วัน) · อายุเก็บ lead ที่ไม่แปลง (เดือน · 0 = ปิด) — คีย์ crm.settings.manage
//   • ขอไฟล์ส่งออกทั้งระบบ CSV/JSON (งานเบื้องหลัง) + รายการงานของฉัน + ลิงก์ดาวน์โหลดชั่วคราว (≤ 15 นาที · เฉพาะผู้ขอ)
// 🔴 ไฟล์ client: import ได้เฉพาะ privacy-shared (บริสุทธิ์) + server actions · ข้อผิดพลาดแสดงในกล่อง (ไม่มี alert())

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTenantExportAction, listTenantExportsAction, saveRetentionAction, startTenantExportAction } from "@/lib/modules/crm/privacy-actions";
import { LEAD_RETENTION_CONFIRM_WORD, type CrmExportDto } from "@/lib/modules/crm/privacy-shared";

const STATUS_LABEL: Record<CrmExportDto["status"], string> = {
  QUEUED: "รอคิว",
  RUNNING: "กำลังสร้างไฟล์",
  DONE: "พร้อมดาวน์โหลด",
  FAILED: "ไม่สำเร็จ",
  EXPIRED: "หมดอายุแล้ว",
};

export function PrivacySettings({
  systemId,
  retention,
  canManage,
  canExport,
  initialJobs,
}: {
  systemId: string;
  retention: { exportDays: number; leadMonths: number };
  canManage: boolean;
  canExport: boolean;
  initialJobs: CrmExportDto[];
}) {
  const router = useRouter();
  const [exportDays, setExportDays] = useState(String(retention.exportDays));
  const [leadMonths, setLeadMonths] = useState(String(retention.leadMonths));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [jobs, setJobs] = useState<CrmExportDto[]>(initialJobs);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [confirmLower, setConfirmLower] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const ed = Number(exportDays);
  const lm = Number(leadMonths);
  const edBad = !Number.isInteger(ed) || ed < 1 || ed > 90;
  const lmBad = !Number.isInteger(lm) || lm < 0 || lm > 120;
  // รีวิว C3.9 S4 (ก): ลดอายุเก็บ lead (หรือเปิดจาก 0) = ลบ lead ที่เกินอายุใหม่ในรอบงานถัดไป ⇒ ต้องติ๊กยืนยัน + พิมพ์คำยืนยัน
  const lowering = !lmBad && lm > 0 && (retention.leadMonths === 0 || lm < retention.leadMonths);
  const lowerOk = !lowering || (confirmLower && confirmText.trim() === LEAD_RETENTION_CONFIRM_WORD);

  async function save() {
    if (edBad || lmBad || !lowerOk) return;
    setSaving(true);
    setMsg(null);
    const r = await saveRetentionAction(systemId, { exportDays: ed, leadMonths: lm, confirm: lowering ? confirmLower : undefined, confirmText: lowering ? confirmText : undefined });
    setSaving(false);
    setMsg(r.ok ? { ok: true, text: "บันทึกอายุเก็บข้อมูลแล้ว" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }

  async function refresh() {
    const r = await listTenantExportsAction(systemId);
    if (r.ok) setJobs(r.jobs);
    else setExportMsg({ ok: false, text: r.error });
  }

  async function start(format: "CSV" | "JSON") {
    setExportBusy(true);
    setExportMsg(null);
    const r = await startTenantExportAction(systemId, format);
    setExportBusy(false);
    if (!r.ok) {
      setExportMsg({ ok: false, text: r.error });
      return;
    }
    setExportMsg({ ok: true, text: "รับคำขอแล้ว — ระบบกำลังสร้างไฟล์ (ประมาณ 1–2 นาที) กด “ดูสถานะล่าสุด” เพื่อดาวน์โหลด" });
    await refresh();
  }

  async function download(jobId: string) {
    const r = await getTenantExportAction(systemId, jobId);
    if (!r.ok) {
      setExportMsg({ ok: false, text: r.error });
      return;
    }
    if (r.job.url) window.location.assign(r.job.url);
    else setExportMsg({ ok: false, text: r.job.error ?? "ไฟล์ยังไม่พร้อม — รอสักครู่แล้วกด “ดูสถานะล่าสุด”" });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {canManage ? (
        <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-retention">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">อายุเก็บข้อมูล (PDPA)</h2>
            <p className="text-xs text-[color:var(--color-muted)]">
              ระบบล้างข้อมูลให้เองวันละครั้ง · lead ที่ไม่เคลื่อนไหวจนครบอายุจะถูกลบข้อมูลส่วนบุคคล โดยผู้ดูแลได้รับแจ้งเตือนก่อน 30 วัน · ดีลและตัวเลขยอดขายไม่ถูกลบ
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs" htmlFor="crm-retention-export-days">
              อายุไฟล์ส่งออก (วัน · 1–90)
              <input id="crm-retention-export-days" className="input text-sm" inputMode="numeric" value={exportDays} onChange={(e) => setExportDays(e.target.value)} data-testid="crm-retention-export-days" />
              {edBad ? <span className="text-[color:var(--color-danger)]">ใส่จำนวนวันเต็มตั้งแต่ 1 ถึง 90</span> : null}
            </label>
            <label className="flex flex-col gap-1 text-xs" htmlFor="crm-retention-lead-months">
              อายุเก็บ lead ที่ไม่แปลง (เดือน · 0 = ไม่ลบอัตโนมัติ)
              <input id="crm-retention-lead-months" className="input text-sm" inputMode="numeric" value={leadMonths} onChange={(e) => setLeadMonths(e.target.value)} data-testid="crm-retention-lead-months" />
              {lmBad ? <span className="text-[color:var(--color-danger)]">ใส่จำนวนเดือนเต็มตั้งแต่ 0 ถึง 120</span> : null}
            </label>
          </div>
          {lowering ? (
            <div className="flex flex-col gap-2 rounded border border-[color:var(--color-danger)] p-3 text-xs" data-testid="crm-retention-lower-panel">
              <p>
                ลดอายุเก็บ lead เป็น {lm} เดือน: lead ที่ไม่เคลื่อนไหวเกิน {lm} เดือนจะถูกลบข้อมูลส่วนบุคคลในรอบงานถัดไป (ภายใน 1 วัน) และย้อนกลับไม่ได้
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={confirmLower} onChange={(e) => setConfirmLower(e.target.checked)} data-testid="crm-retention-lower-confirm" />
                ฉันเข้าใจว่าการลบนี้ย้อนกลับไม่ได้
              </label>
              <label className="flex flex-col gap-1" htmlFor="crm-retention-lower-text">
                พิมพ์คำว่า “{LEAD_RETENTION_CONFIRM_WORD}” เพื่อยืนยัน
                <input id="crm-retention-lower-text" className="input text-sm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} data-testid="crm-retention-lower-text" />
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary text-sm" disabled={saving || edBad || lmBad || !lowerOk} onClick={save} data-testid="crm-retention-save">
              {saving ? "กำลังบันทึก…" : "บันทึกอายุเก็บข้อมูล"}
            </button>
            {msg ? (
              <span className={`text-xs ${msg.ok ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-danger)]"}`} role={msg.ok ? "status" : "alert"} data-testid="crm-retention-msg">
                {msg.text}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      {canExport ? (
        <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-export">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">ส่งออกข้อมูลทั้งระบบ</h2>
            <p className="text-xs text-[color:var(--color-muted)]">
              ผู้ติดต่อ บริษัท ดีล กิจกรรม ความยินยอม หัวอีเมล และข้อมูลกำหนดเองที่คุณมองเห็น (ไม่มีเนื้ออีเมล · ฟิลด์อ่อนไหวเฉพาะเจ้าของร้าน) · ไฟล์เปิดได้เฉพาะคุณ และถูกลบอัตโนมัติตามอายุไฟล์ส่งออก
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost text-sm" disabled={exportBusy} onClick={() => start("CSV")} data-testid="crm-export-start-csv">
              ขอไฟล์ CSV
            </button>
            <button type="button" className="btn btn-ghost text-sm" disabled={exportBusy} onClick={() => start("JSON")} data-testid="crm-export-start-json">
              ขอไฟล์ JSON
            </button>
            <button type="button" className="btn btn-ghost text-sm" onClick={refresh} data-testid="crm-export-refresh">
              ดูสถานะล่าสุด
            </button>
          </div>
          {jobs.length ? (
            <ul className="flex flex-col gap-1 text-xs" data-testid="crm-export-jobs">
              {jobs.map((j) => (
                <li key={j.jobId} className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-border)] pt-1">
                  <span className="min-w-0 truncate">
                    {j.format ?? "—"} · {STATUS_LABEL[j.status]}
                    {j.status === "DONE" ? ` · ${j.rowCount.toLocaleString("th-TH")} แถว` : ""}
                    {j.error ? ` — ${j.error}` : ""}
                  </span>
                  {j.status === "DONE" ? (
                    <button type="button" className="btn btn-ghost text-xs" onClick={() => download(j.jobId)} data-testid="crm-export-download">
                      ดาวน์โหลด
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {exportMsg ? (
            <p className={`text-xs ${exportMsg.ok ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-danger)]"}`} role={exportMsg.ok ? "status" : "alert"} data-testid="crm-export-msg">
              {exportMsg.text}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
