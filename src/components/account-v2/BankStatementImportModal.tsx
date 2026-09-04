"use client";

// BankStatementImportModal — "นำเข้ารายการเดินบัญชี (CSV)" (WO 5.3 · §10.2 · g10 ปุ่มหัวขวา)
// ขั้นตอนเดียวกับตัวนำเข้า CSV ของ WO 1.8: เลือกรูปแบบธนาคาร → เลือกไฟล์ → ตรวจสอบ (20 แถวแรก + error ต่อแถว) → นำเข้า
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { FormField } from "@/components/ui/FormField";
import { formatBaht } from "@/lib/ui/money";
import { BANK_SOURCES, BANK_SOURCE_LABEL, type BankSource } from "@/lib/modules/account/bank-statement-csv";
import type { ImportPreview } from "@/lib/modules/account/reconcile";
import { previewStatementAction, importStatementAction } from "@/app/app/sys/[id]/account/finance/reconcile/actions";

export function BankStatementImportModal({
  systemId,
  financeId,
  periodKey,
  channelLabel,
  monthLabel,
  onClose,
}: {
  systemId: string;
  financeId: string;
  periodKey: string;
  channelLabel: string;
  monthLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<BankSource>("KBANK");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onPick = async (f: File | null) => {
    setPreview(null);
    setErr(null);
    setDone(null);
    if (!f) {
      setFileName("");
      setText("");
      return;
    }
    const raw = await f.text();
    setFileName(f.name);
    setText(raw);
  };

  const doPreview = () => {
    if (!text) {
      setErr("เลือกไฟล์ก่อน");
      return;
    }
    start(async () => {
      const res = await previewStatementAction(systemId, { financeId, periodKey, source, fileName, text });
      if (!res.ok) {
        setErr(res.reason);
        setPreview(null);
        return;
      }
      setErr(null);
      setPreview(res.preview);
    });
  };

  const doImport = () => {
    start(async () => {
      const res = await importStatementAction(systemId, { financeId, periodKey, source, fileName, text });
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      setDone(`นำเข้า ${res.imported} รายการ · ซ้ำที่ข้าม ${res.duplicates} · จับคู่อัตโนมัติ ${res.matched} · แนะนำจับคู่ ${res.suggested} · รอจับคู่ ${res.unmatched}`);
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      sheetOnMobile
      testId="reconcile-import-modal"
      title="นำเข้ารายการเดินบัญชี (CSV)"
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} data-testid="reconcile-import-close">
            ปิด
          </button>
          {preview && !done && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || preview.newRows === 0}
              onClick={doImport}
              data-testid="reconcile-import-submit"
            >
              {pending ? "กำลังนำเข้า…" : `นำเข้า ${preview.newRows} รายการ`}
            </button>
          )}
          {!preview && (
            <button type="button" className="btn btn-primary" disabled={pending || !text} onClick={doPreview} data-testid="reconcile-import-check">
              {pending ? "กำลังตรวจสอบ…" : "ตรวจสอบไฟล์"}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[color:var(--color-muted)]" data-testid="reconcile-import-target">
          ช่องทาง <span className="font-medium text-[color:var(--color-ink)]">{channelLabel}</span> · เดือน{" "}
          <span className="font-medium text-[color:var(--color-ink)]">{monthLabel}</span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="รูปแบบไฟล์ของธนาคาร">
            <select
              className="input"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as BankSource);
                setPreview(null);
              }}
              data-testid="reconcile-import-source"
            >
              {BANK_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {BANK_SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ไฟล์ CSV ที่ดาวน์โหลดจากธนาคาร">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="input"
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
              data-testid="reconcile-import-file"
            />
          </FormField>
        </div>

        <p className="text-xs text-[color:var(--color-muted)]">
          รองรับวันที่แบบ พ.ศ. (01/09/2569) และ ค.ศ. · ยอดในวงเล็บ (250.00) = เงินออก · ไฟล์ต้องเป็น UTF-8
          (ถ้าเปิดใน Excel แล้วภาษาไทยเพี้ยน ให้ Save As → CSV UTF-8 ก่อน)
        </p>

        {err && (
          <p className="text-sm text-[color:var(--color-danger)]" data-testid="reconcile-import-error">
            {err}
          </p>
        )}
        {done && (
          <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }} data-testid="reconcile-import-done">
            {done}
          </p>
        )}

        {preview && (
          <div className="flex flex-col gap-2" data-testid="reconcile-import-preview">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>อ่านได้ <b>{preview.totalRows}</b> แถว</span>
              <span>นำเข้าใหม่ <b data-testid="reconcile-import-new">{preview.newRows}</b></span>
              <span>ซ้ำ (ข้าม) <b>{preview.duplicateRows}</b></span>
              <span>นอกเดือนที่เลือก (ข้าม) <b>{preview.outOfPeriodRows}</b></span>
              <span>อ่านไม่ออก <b>{preview.errors.length}</b></span>
              {preview.closingFromFile != null && <span>ยอดคงเหลือปลายงวดในไฟล์ <b>{formatBaht(preview.closingFromFile, { decimals: true })}</b></span>}
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">รูปแบบที่ใช้อ่าน: {preview.sourceLabel} · แสดง {preview.rows.length} แถวแรก</div>

            <div className="max-h-72 overflow-auto rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                    <th className="px-3 py-2 font-medium">วันที่</th>
                    <th className="px-3 py-2 font-medium">รายละเอียด</th>
                    <th className="px-3 py-2 font-medium">อ้างอิง</th>
                    <th className="px-3 py-2 text-right font-medium">เข้า/ออก</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.seq} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }}>
                      <td className="px-3 py-2 whitespace-nowrap">{r.dateText}</td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2 text-xs text-[color:var(--color-muted)]">{r.refNo ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={r.amountSatang < 0 ? { color: "var(--color-danger)" } : undefined}>
                        {r.amountSatang > 0 ? "+" : ""}
                        {formatBaht(r.amountSatang, { decimals: true })}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.outOfPeriod ? "นอกเดือน (ข้าม)" : r.duplicate ? "ซ้ำ (ข้าม)" : "นำเข้า"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.errors.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-danger)" }} data-testid="reconcile-import-errors">
                {preview.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>บรรทัด {e.row}: {e.reason}</li>
                ))}
                {preview.errors.length > 10 && <li>… และอีก {preview.errors.length - 10} บรรทัด</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default BankStatementImportModal;
