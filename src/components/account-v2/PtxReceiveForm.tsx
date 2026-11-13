"use client";
// ─────────────────────────────────────────────────────────────
// PtxReceiveForm — บันทึกรับใบกำกับภาษีซื้อ (ACC T1.5) + "เคลมไม่ได้" (ACC T1.4 §7)
//   วันที่ในใบ · เลขที่ใบของผู้ขาย · วันที่ลงภาษีซื้อ (ค่าเริ่ม วันนี้ = เดือนที่รับจริง)
//   คำเตือนเคลมข้ามเดือน/เกินเพดานคิดสดด้วยตัวคำนวณเดียวกับ server (input-vat-shared.checkLateClaim) · ด่านจริงอยู่ที่ service
// 🔴 client: import ได้เฉพาะไฟล์ pure · ไม่มี emoji
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { checkLateClaim, INPUT_VAT_NONCLAIM_REASONS } from "@/lib/modules/account/input-vat-shared";
import { LegalWarnings } from "./LegalWarnings";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";

const bahtSigned = (s: number) => `${s < 0 ? "−" : s > 0 ? "+" : ""}${(Math.abs(s) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ACC T1.7 — คำเตือนล่วงหน้า "ลงเดือนที่ยื่น ภ.พ.30 แล้ว" (ข้อความเดียวกับด่าน filed-guard · ด่านจริงอยู่ชั้นลงบัญชี) */
function filedWarning(months: readonly string[], ymd: string, ref: string, input: number, parked: number): LegalWarning[] {
  const period = ymd.slice(0, 7);
  if (!months.includes(period) || (input === 0 && parked === 0)) return [];
  return [legalWarning("FILED_PERIOD_VAT_CHANGE", { period, ref, output: bahtSigned(0), input: bahtSigned(input), ...(parked ? { parked: bahtSigned(parked) } : {}) })];
}

const toDate = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T00:00:00.000Z`) : null);

export function PtxReceiveForm({
  systemId,
  docId,
  docType,
  today,
  filedVatMonths = [],
  pendingVat = 0,
  docRef = "ใบกำกับภาษีซื้อ",
  back,
  receiveAction,
  notClaimableAction,
  testId = "ptx-receive",
}: {
  systemId: string;
  docId: string;
  docType: string;
  /** วันนี้ (ไทย YYYY-MM-DD) จาก server */
  today: string;
  /** ACC T1.7 — เดือนที่ยื่น ภ.พ.30 แล้ว (YYYY-MM) · ยอดภาษีซื้อที่พักรอใบนี้ (สตางค์) · ชื่อรายการในคำเตือน */
  filedVatMonths?: string[];
  pendingVat?: number;
  docRef?: string;
  back?: string;
  receiveAction: (fd: FormData) => void | Promise<void>;
  notClaimableAction: (fd: FormData) => void | Promise<void>;
  testId?: string;
}) {
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [claimDate, setClaimDate] = useState(today);
  const [mode, setMode] = useState<"receive" | "noclaim">("receive");
  const chk = useMemo(() => {
    const a = toDate(invoiceDate);
    const b = toDate(claimDate);
    return a && b ? checkLateClaim(a, b) : null;
  }, [invoiceDate, claimDate]);
  // รับ: ภาษีซื้อเข้าเดือนของวันที่ลงภาษีซื้อ (1150 +, 1155 −) · เคลมไม่ได้: ลงวันนี้ (1155 −)
  const filedReceive = filedWarning(filedVatMonths, claimDate, docRef, pendingVat, -pendingVat);
  const filedNoClaim = filedWarning(filedVatMonths, today, docRef, 0, -pendingVat);
  const receiveWarnings = [...(chk?.warnings ?? []), ...filedReceive];
  const hidden = (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      <input type="hidden" name="id" value={docId} />
      {back && <input type="hidden" name="back" value={back} />}
    </>
  );
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      {/* ACC T1.4 (ค้างหลังภาพจอ) ▸ แท็บหน้าตาแท็บ (เส้นใต้) ไม่ใช่ปุ่มสองปุ่ม ◂ */}
      <div className="flex gap-1 border-b text-sm" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "receive"} className={`-mb-px border-b-2 px-3 py-2 ${mode === "receive" ? "border-[color:var(--color-ink)] font-semibold" : "border-transparent text-[color:var(--color-muted)]"}`} onClick={() => setMode("receive")} data-testid={`${testId}-tab-receive`}>
          ได้รับใบกำกับแล้ว
        </button>
        <button type="button" role="tab" aria-selected={mode === "noclaim"} className={`-mb-px border-b-2 px-3 py-2 ${mode === "noclaim" ? "border-[color:var(--color-ink)] font-semibold" : "border-transparent text-[color:var(--color-muted)]"}`} onClick={() => setMode("noclaim")} data-testid={`${testId}-tab-noclaim`}>
          ใบกำกับไม่มา / เคลมไม่ได้
        </button>
      </div>
      {mode === "receive" ? (
        <form action={receiveAction} className="flex flex-col gap-3">
          {hidden}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันที่ในใบกำกับภาษี
              <input type="date" name="vendorInvoiceDate" className="input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required data-testid={`${testId}-invoice-date`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              เลขที่ใบกำกับของผู้ขาย
              <input type="text" name="vendorInvoiceNo" className="input" maxLength={35} data-testid={`${testId}-invoice-no`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              วันที่ลงภาษีซื้อ (เดือนภาษีที่เคลม)
              <input type="date" name="claimDate" className="input" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} required data-testid={`${testId}-claim-date`} />
            </label>
          </div>
          {chk?.note && (
            <p className="text-sm font-medium" data-testid={`${testId}-late-note`}>
              ข้อความที่ต้องระบุบนใบ: {chk.note}
            </p>
          )}
          {receiveWarnings.length > 0 && <LegalWarnings warnings={receiveWarnings} ackName="ack" testId={`${testId}-warnings`} />}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" data-testid={`${testId}-submit`}>
              รับใบกำกับแล้ว
            </button>
          </div>
        </form>
      ) : (
        <form action={notClaimableAction} className="flex flex-col gap-3">
          {hidden}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เหตุที่เคลมไม่ได้
            <select name="reason" className="input" defaultValue="NO_TAX_INVOICE" data-testid={`${testId}-reason`}>
              {INPUT_VAT_NONCLAIM_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.labelTh} ({r.sectionTh})
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-[color:var(--color-muted)]">ภาษีซื้อที่พักไว้ย้ายไปบัญชีภาษีซื้อไม่ขอคืน ลงวันที่วันนี้ — ไม่เข้า ภ.พ.30</p>
          {filedNoClaim.length > 0 && <LegalWarnings warnings={filedNoClaim} ackName="ack" testId={`${testId}-noclaim-warnings`} />}
          <div>
            <button type="submit" className="btn btn-sm" data-testid={`${testId}-noclaim-submit`}>
              บันทึกว่าเคลมไม่ได้
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default PtxReceiveForm;
