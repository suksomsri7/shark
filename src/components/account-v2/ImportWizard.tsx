"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper, type StepDef } from "./Stepper";
import {
  previewImportAction,
  runImportAction,
  type PreviewResult,
  type ImportRunResult,
} from "@/lib/modules/account/import-actions";
import { IMPORT_FIELDS, IMPORT_MAX_FILE_BYTES, type ImportKind, type ColumnMapping } from "@/lib/modules/account/import-shared";

// ─────────────────────────────────────────────────────────────
// ImportWizard — ตัวช่วยนำเข้า CSV กลาง (WO 1.8, DESIGN-SPEC-V2.md §8.5)
// ① ดาวน์โหลดเทมเพลต + อัปโหลด → ② จับคู่คอลัมน์ → ③ ตรวจสอบ (preview 20 แถว) → ④ นำเข้า → ⑤ สรุปผล
// ใช้ทั้ง 3 เส้นทาง: เอกสาร (รายรับ/รายจ่าย) · ผู้ติดต่อ · สินค้า — ต่างกันแค่ kind/label
// ─────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STATUS_LABEL: Record<"ok" | "warn" | "err", string> = { ok: "พร้อมนำเข้า", warn: "เตือน", err: "ผิดพลาด" };
const STATUS_ICON: Record<"ok" | "warn" | "err", string> = { ok: "✓", warn: "⚠", err: "✗" };
const STATUS_COLOR: Record<"ok" | "warn" | "err", string> = {
  ok: "var(--color-ink)",
  warn: "#a16207",
  err: "var(--color-danger)",
};

export function ImportWizard({
  systemId,
  kind,
  title,
  backHref,
  templateHref,
}: {
  systemId: string;
  kind: ImportKind;
  title: string;
  backHref: string;
  templateHref: string;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileError, setFileError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [skipErrorRows, setSkipErrorRows] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<ImportRunResult | null>(null);

  const fields = IMPORT_FIELDS[kind];

  async function onFile(file: File) {
    setFileError("");
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      setFileError("ไฟล์ใหญ่เกิน 5MB — แบ่งไฟล์แล้วนำเข้าหลายรอบ");
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setBusy(true);
    const res = await previewImportAction(systemId, kind, text);
    setBusy(false);
    if (!res.ok) {
      setFileError(res.reason);
      return;
    }
    setPreview(res);
    setMapping(res.mapping);
    setStep(2);
  }

  async function reValidate(nextMapping: ColumnMapping) {
    setBusy(true);
    const res = await previewImportAction(systemId, kind, csvText, nextMapping);
    setBusy(false);
    if (res.ok) setPreview(res);
  }

  async function onRunImport() {
    setBusy(true);
    setRunError("");
    const res = await runImportAction(systemId, kind, csvText, mapping, skipErrorRows);
    setBusy(false);
    if (!res.ok) {
      setRunError(res.reason);
      return;
    }
    setResult(res);
    setStep(5);
  }

  const steps: StepDef[] = [
    { code: "1", label: "อัปโหลด", state: step > 1 ? "done" : step === 1 ? "current" : "next" },
    { code: "2", label: "จับคู่คอลัมน์", state: step > 2 ? "done" : step === 2 ? "current" : "next" },
    { code: "3", label: "ตรวจสอบ", state: step > 3 ? "done" : step === 3 ? "current" : "next" },
    { code: "4", label: "นำเข้า", state: step > 4 ? "done" : step === 4 ? "current" : "next" },
    { code: "5", label: "สรุปผล", state: step === 5 ? "current" : "next" },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-24">
      <PageHeader title={title} back={{ href: backHref, label: "กลับ" }} />
      <Stepper steps={steps} testId="import-step" />

      {/* ① ดาวน์โหลดเทมเพลต + dropzone */}
      {step === 1 && (
        <div className="card flex flex-col gap-4 p-5">
          <div>
            <a href={templateHref} className="btn btn-ghost min-h-[44px] text-sm" data-testid="btn-download-template">
              ดาวน์โหลดเทมเพลต CSV
            </a>
            <p className="mt-2 text-xs text-[color:var(--color-muted)]">
              เปิดเทมเพลตด้วย Excel/Google Sheets กรอกข้อมูลตามหัวคอลัมน์ (มีตัวอย่าง 2 แถวให้ดูรูปแบบ) แล้วบันทึกเป็น .csv
              กลับมาอัปโหลดที่นี่
            </p>
          </div>
          <label
            data-testid="import-dropzone"
            className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-[color:var(--color-muted)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span>ลากไฟล์ .csv มาวาง หรือคลิกเพื่อเลือกไฟล์</span>
            <span className="text-xs">≤ 5MB · ≤ 2,000 แถว</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          {busy && <p className="text-sm text-[color:var(--color-muted)]">กำลังอ่านไฟล์…</p>}
          {fileError && <p className="text-sm text-[color:var(--color-danger)]">{fileError}</p>}
        </div>
      )}

      {/* ② จับคู่คอลัมน์ */}
      {step === 2 && preview && preview.ok && (
        <div className="card flex flex-col gap-4 p-5">
          <p className="text-sm">
            ไฟล์ <span className="font-medium">{fileName}</span> · {preview.totalRows} แถว — ระบบจับคู่คอลัมน์ให้อัตโนมัติ
            ตรวจ/แก้ได้ก่อนนำเข้า
          </p>
          <div className="flex flex-col gap-2">
            {fields.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-56 shrink-0 text-sm">
                  {f.label}
                  {f.required && <span className="text-[color:var(--color-danger)]"> *</span>}
                </span>
                <select
                  data-testid={`import-map-${f.key}`}
                  className="input max-w-xs text-sm"
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                >
                  <option value={-1}>— ไม่ใช้ —</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-sm" onClick={() => setStep(1)}>
              ย้อนกลับ
            </button>
            <button
              type="button"
              data-testid="btn-goto-preview"
              className="btn btn-primary min-h-[44px] text-sm"
              disabled={busy}
              onClick={async () => {
                await reValidate(mapping);
                setStep(3);
              }}
            >
              ถัดไป: ตรวจสอบ
            </button>
          </div>
        </div>
      )}

      {/* ③ ตรวจสอบ (preview 20 แถว + ตัวนับ) */}
      {step === 3 && preview && preview.ok && (
        <div className="card flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span data-testid="import-count-ok">พร้อมนำเข้า {preview.counts.ok}</span>
            <span data-testid="import-count-warn" style={{ color: STATUS_COLOR.warn }}>
              เตือน {preview.counts.warn}
            </span>
            <span data-testid="import-count-err" style={{ color: STATUS_COLOR.err }}>
              ผิดพลาด {preview.counts.err}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-muted)]">
                  <th className="py-1 pr-2">แถว</th>
                  <th className="py-1 pr-2">สถานะ</th>
                  <th className="py-1 pr-2">ข้อมูล</th>
                  <th className="py-1 pr-2">เหตุผล</th>
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((r, i) => (
                  <tr key={i} data-testid={`import-preview-row-${i}`} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                    <td className="py-1 pr-2">{r.row}</td>
                    <td className="py-1 pr-2" style={{ color: STATUS_COLOR[r.status] }}>
                      {STATUS_ICON[r.status]} {STATUS_LABEL[r.status]}
                    </td>
                    <td className="max-w-xs truncate py-1 pr-2 text-[color:var(--color-muted)]">{r.summary}</td>
                    <td className="py-1 pr-2 text-[color:var(--color-muted)]">{r.reasons.join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.totalRows > preview.previewRows.length && (
            <p className="text-xs text-[color:var(--color-muted)]">
              แสดง {preview.previewRows.length} จาก {preview.totalRows} แถว — ตัวนับด้านบนนับครบทุกแถว
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipErrorRows}
              onChange={(e) => setSkipErrorRows(e.target.checked)}
              data-testid="import-skip-errors"
            />
            ข้ามแถวที่ผิดพลาด (นำเข้าเฉพาะแถวที่พร้อม/เตือน)
          </label>

          {runError && <p className="text-sm text-[color:var(--color-danger)]">{runError}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-sm" onClick={() => setStep(2)}>
              ย้อนกลับ
            </button>
            <button
              type="button"
              data-testid="btn-import-run"
              className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
              disabled={busy || (preview.counts.err > 0 && !skipErrorRows) || preview.counts.ok + preview.counts.warn === 0}
              title={preview.counts.err > 0 && !skipErrorRows ? "ติ๊ก \"ข้ามแถวที่ผิดพลาด\" หรือแก้ไฟล์ก่อน" : undefined}
              onClick={async () => {
                setStep(4);
                await onRunImport();
              }}
            >
              {busy ? "กำลังนำเข้า…" : "นำเข้า"}
            </button>
          </div>
        </div>
      )}

      {/* ④ กำลังนำเข้า */}
      {step === 4 && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-sm text-[color:var(--color-muted)]">กำลังนำเข้าข้อมูล — โปรดรอสักครู่…</p>
        </div>
      )}

      {/* ⑤ สรุปผล */}
      {step === 5 && result && result.ok && (
        <div className="card flex flex-col gap-4 p-5" data-testid="import-result">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>สร้างใหม่ {result.created} รายการ</span>
            <span className="text-[color:var(--color-muted)]">ข้าม {result.skipped} รายการ</span>
            {result.errors.length > 0 && (
              <span style={{ color: STATUS_COLOR.err }}>ผิดพลาด {result.errors.length} แถว</span>
            )}
          </div>
          {result.created > 0 && (
            <p className="text-xs text-[color:var(--color-muted)]">
              ติดแท็ก &quot;{result.tag}&quot; — ค้นหาแท็กนี้ในหน้ารายการเพื่อดูของที่นำเข้ารอบนี้
            </p>
          )}
          {result.errors.length > 0 && (
            <ul className="flex flex-col gap-0.5 border-t pt-2 text-xs text-[color:var(--color-danger)]" style={{ borderColor: "var(--color-line)" }}>
              {result.errors.slice(0, 50).map((er, i) => (
                <li key={i}>
                  แถวที่ {er.row}: {er.reason}
                </li>
              ))}
              {result.errors.length > 50 && <li>… และอีก {result.errors.length - 50} แถว</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <Link href={backHref} className="btn btn-primary min-h-[44px] text-sm">
              ดูรายการ
            </Link>
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                setStep(1);
                setFileName("");
                setCsvText("");
                setPreview(null);
                setResult(null);
                setRunError("");
              }}
            >
              นำเข้าไฟล์อื่น
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportWizard;
