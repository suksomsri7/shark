"use client";

// ปุ่มเครื่องมือของหน้ารายชื่อบริษัท: นำเข้า CSV (กล่อง) · ส่งออก CSV (ดาวน์โหลด) — CRM v2 · ใบ C1.3
// 🔴 ไฟล์ client: import ได้เฉพาะ companies-shared (บริสุทธิ์) + server actions — ไม่ลากโมดูลที่ถึง prisma

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_IMPORT_MAX_BYTES, COMPANY_IMPORT_MAX_ROWS } from "@/lib/modules/crm/companies-shared";
import { exportCompaniesAction, importCompaniesAction } from "@/lib/modules/crm/companies-actions";

type Filters = { q?: string | null; industry?: string | null; size?: string | null; owner?: string | null; hasOpenDeals?: boolean | null; includeArchived?: boolean | null };

export function CompanyExportButton({ systemId, filters }: { systemId: string; filters: Filters }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        data-testid="companies-export-btn"
        className="btn btn-ghost text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await exportCompaniesAction(systemId, filters);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            const blob = new Blob([`\ufeff${r.csv}`], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          })
        }
      >
        {pending ? "กำลังเตรียมไฟล์…" : "ส่งออก CSV"}
      </button>
      {error && <span className="text-xs text-[color:var(--color-danger)]">{error}</span>}
    </span>
  );
}

export function CompanyImportButton({ systemId }: { systemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(COMPANY_IMPORT_MAX_BYTES / 1024 / 1024);

  const submit = () =>
    start(async () => {
      setError(null);
      setResult(null);
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("เลือกไฟล์ CSV ก่อน");
        return;
      }
      if (file.size > COMPANY_IMPORT_MAX_BYTES) {
        setError(`ไฟล์ใหญ่เกิน ${maxMb} MB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
        return;
      }
      const text = await file.text();
      const r = await importCompaniesAction(systemId, text);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult({ created: r.created, skipped: r.skipped, errors: r.errors });
      router.refresh();
    });

  return (
    <>
      <button type="button" data-testid="companies-import-btn" className="btn btn-ghost text-sm" onClick={() => setOpen(true)}>
        นำเข้า CSV
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => (e.target === e.currentTarget ? setOpen(false) : undefined)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="นำเข้าบริษัทจากไฟล์ CSV"
            data-testid="companies-import-modal"
            className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
          >
            <h2 className="text-base font-semibold">นำเข้าบริษัทจากไฟล์ CSV</h2>
            <p className="text-xs text-[color:var(--color-muted)]">
              แถวแรกเป็นหัวคอลัมน์ เช่น <code>name,taxId,website,industry,size,emailDomain,phone,email</code> (ใช้หัวภาษาไทยได้) ·
              ครั้งละไม่เกิน {COMPANY_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถว / {maxMb} MB · เลขภาษีซ้ำจะถูกข้าม
            </p>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>ไฟล์ CSV</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" data-testid="companies-import-file" className="input text-sm" />
            </label>
            {error && (
              <p className="text-sm text-[color:var(--color-danger)]" data-testid="companies-import-error">
                {error}
              </p>
            )}
            {result && (
              <div className="rounded-lg border p-3 text-sm" data-testid="companies-import-result">
                <p>
                  เพิ่มแล้ว {result.created.toLocaleString("th-TH")} บริษัท · ข้าม {result.skipped.toLocaleString("th-TH")} แถว
                  {result.errors.length > 0 ? ` · มีปัญหา ${result.errors.length.toLocaleString("th-TH")} แถว` : ""}
                </p>
                {result.errors.length > 0 && (
                  <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-[color:var(--color-muted)]">
                    {result.errors.slice(0, 50).map((e) => (
                      <li key={e.row}>
                        แถว {e.row}: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" data-testid="companies-import-cancel" onClick={() => setOpen(false)}>
                ปิด
              </button>
              <button type="button" className="btn btn-primary text-sm" data-testid="companies-import-submit" disabled={pending} onClick={submit}>
                {pending ? "กำลังนำเข้า…" : "นำเข้า"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
