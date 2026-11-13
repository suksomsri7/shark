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

const toDate = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T00:00:00.000Z`) : null);

export function PtxReceiveForm({
  systemId,
  docId,
  docType,
  today,
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
      <div className="flex gap-2 text-sm" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "receive"} className={`btn btn-sm ${mode === "receive" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("receive")} data-testid={`${testId}-tab-receive`}>
          ได้รับใบกำกับแล้ว
        </button>
        <button type="button" role="tab" aria-selected={mode === "noclaim"} className={`btn btn-sm ${mode === "noclaim" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("noclaim")} data-testid={`${testId}-tab-noclaim`}>
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
          {chk && chk.warnings.length > 0 && <LegalWarnings warnings={chk.warnings} ackName="ack" testId={`${testId}-warnings`} />}
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
