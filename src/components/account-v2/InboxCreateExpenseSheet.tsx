"use client";

// InboxCreateExpenseSheet — แผ่นยืนยันก่อนสร้าง "บันทึกค่าใช้จ่าย" จากบิลในกล่องขาเข้า (WO 7.2 · §12)
//
// ทำไมต้องมีขั้นยืนยัน: ผลอ่านของ AI เป็น "ข้อเสนอ" ไม่ใช่ข้อมูลบัญชี — เจ้าของต้องเห็นรูปบิลคู่กับค่าที่จะบันทึก
// และแก้ได้ทุกช่องก่อนกดสร้าง (บนจอเดียวกัน ซ้าย=รูป ขวา=ค่า+รายการสินค้า) · กดสร้าง = ได้ **ร่าง** เท่านั้น
// ยังไม่เดินบัญชี (ออกเอกสารจริงทำในหน้าแก้ไขซึ่งเปิดต่อให้ทันที)
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { DateInput } from "./DateInput";
import { MoneyInput } from "./MoneyInput";
import { formatBaht } from "@/lib/ui/money";
import { createExpenseFromAttachmentAction } from "@/app/app/sys/[id]/account/documents/inbox/actions";
import type { AttachmentRowView } from "@/lib/modules/account/attachment";
import type { BillDocKind } from "@/lib/modules/account/inbox-ai";

const DOC_KIND_OPTIONS: ReadonlyArray<{ value: BillDocKind; label: string; vat: string }> = [
  { value: "TAX_INVOICE", label: "ใบกำกับภาษี", vat: "ภาษีซื้อขอคืนได้" },
  { value: "RECEIPT", label: "ใบเสร็จรับเงิน", vat: "ไม่มีใบกำกับ — ขอคืนภาษีซื้อไม่ได้" },
  { value: "INVOICE", label: "ใบแจ้งหนี้", vat: "รอใบกำกับภาษี" },
  { value: "SLIP", label: "สลิปโอนเงิน", vat: "ไม่มีใบกำกับ — ขอคืนภาษีซื้อไม่ได้" },
  { value: "OTHER", label: "อื่น ๆ", vat: "ไม่มีใบกำกับ — ขอคืนภาษีซื้อไม่ได้" },
];

/** วันนี้ตามเวลาไทย (ISO) — ใช้เป็นค่าเริ่มต้นเมื่อบิลไม่มีวันที่ */
function todayIsoTh(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function InboxCreateExpenseSheet({
  open,
  onClose,
  systemId,
  row,
  editorPathTemplate,
}: {
  open: boolean;
  onClose: () => void;
  systemId: string;
  row: AttachmentRowView;
  /** แม่แบบเส้นทางหน้าแก้ไขเอกสาร (มี `{docId}` ให้แทน) — ห้ามรับเป็นฟังก์ชันจาก server component */
  editorPathTemplate: string;
}) {
  const router = useRouter();
  const ex = row.aiExtract;
  const [vendorName, setVendorName] = useState(ex?.vendorName ?? "");
  const [vendorTaxId, setVendorTaxId] = useState(ex?.vendorTaxId ?? "");
  const [invoiceNo, setInvoiceNo] = useState(ex?.invoiceNo ?? "");
  const [issueDate, setIssueDate] = useState(ex?.issueDate ?? todayIsoTh());
  const [totalSatang, setTotalSatang] = useState(ex?.totalSatang ?? 0);
  const [vatSatang, setVatSatang] = useState(ex?.vatSatang ?? 0);
  const [docKind, setDocKind] = useState<BillDocKind>(ex?.docKind ?? "OTHER");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // เปิดใหม่ = เริ่มจากค่าที่ AI อ่านได้เสมอ (ผู้ใช้เคยแก้แล้วปิดไป ไม่ควรค้างค่าเก่าที่ไม่ได้บันทึก)
  useEffect(() => {
    if (!open) return;
    setVendorName(ex?.vendorName ?? "");
    setVendorTaxId(ex?.vendorTaxId ?? "");
    setInvoiceNo(ex?.invoiceNo ?? "");
    setIssueDate(ex?.issueDate ?? todayIsoTh());
    setTotalSatang(ex?.totalSatang ?? 0);
    setVatSatang(ex?.vatSatang ?? 0);
    setDocKind(ex?.docKind ?? "OTHER");
    setError("");
  }, [open, ex]);

  const subtotal = Math.max(0, totalSatang - vatSatang);
  const kindHint = DOC_KIND_OPTIONS.find((o) => o.value === docKind)?.vat ?? "";

  const submit = () =>
    start(async () => {
      setError("");
      // อัตรา VAT คำนวณจากยอดที่ผู้ใช้ยืนยันจริง (ผู้ใช้แก้ยอด/VAT เองได้) — ยอดรวมของเอกสาร = ยอดบิลเป๊ะเสมอ
      const vatRateBp = vatSatang > 0 && subtotal > 0 ? Math.round((vatSatang * 10_000) / subtotal) : 0;
      const res = await createExpenseFromAttachmentAction(systemId, row.id, {
        vendorName,
        vendorTaxId: vendorTaxId || null,
        invoiceNo: invoiceNo || null,
        issueDate,
        totalSatang,
        vatSatang,
        vatRateBp,
        docKind,
      });
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      onClose();
      router.push(editorPathTemplate.replace("{docId}", res.docId));
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="สร้างบันทึกค่าใช้จ่ายจากบิล"
      size="lg"
      sheetOnMobile
      testId="inbox-create-sheet"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} data-testid="inbox-create-confirm">
            {pending ? "กำลังสร้าง…" : "สร้างร่างค่าใช้จ่าย"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* ซ้าย: รูปบิลจริง — ต้องเห็นคู่กับตัวเลขเสมอ ไม่งั้นตรวจไม่ได้ว่า AI อ่านถูกไหม */}
        <div className="order-2 md:order-1">
          <div className="flex max-h-[320px] items-center justify-center overflow-hidden rounded-lg border" style={{ background: "var(--color-surface-2)" }}>
            {row.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- รูปจาก CDN ของ tenant
              <img src={row.fileUrl} alt={row.fileName} className="max-h-[320px] w-auto object-contain" />
            ) : (
              <iframe src={row.fileUrl} title={row.fileName} className="h-[320px] w-full" />
            )}
          </div>
          <p className="mt-1 truncate text-xs text-[color:var(--color-muted)]" title={row.fileName}>
            {row.fileName}
          </p>
          {ex && ex.lineItems.length > 0 && (
            <div className="mt-3" data-testid="inbox-create-lines">
              <p className="mb-1 text-sm font-semibold">รายการในบิล</p>
              <ul className="flex flex-col gap-1">
                {ex.lineItems.map((l, i) => (
                  <li key={`${l.description}-${i}`} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-[color:var(--color-muted)]">{l.description}</span>
                    <span className="shrink-0 tabular-nums">{formatBaht(l.amountSatang, { decimals: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ขวา: ค่าที่จะบันทึก (แก้ได้ทุกช่อง) */}
        <div className="order-1 flex flex-col gap-3 md:order-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">ผู้ขาย</span>
            <input
              className="input"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="ชื่อผู้ขายตามบิล"
              data-testid="inbox-create-vendor"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">เลขผู้เสียภาษี</span>
              <input className="input" value={vendorTaxId} onChange={(e) => setVendorTaxId(e.target.value)} inputMode="numeric" data-testid="inbox-create-taxid" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">เลขที่ใบกำกับ</span>
              <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} data-testid="inbox-create-invno" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">วันที่บนบิล</span>
            <DateInput value={issueDate} onChange={setIssueDate} testId="inbox-create-date" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">ชนิดเอกสาร</span>
            <select
              className="input"
              value={docKind}
              onChange={(e) => setDocKind(e.target.value as BillDocKind)}
              data-testid="inbox-create-kind"
            >
              {DOC_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-[color:var(--color-muted)]">{kindHint}</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">ยอดรวมทั้งสิ้น</span>
              <MoneyInput value={totalSatang} onChangeSatang={setTotalSatang} testId="inbox-create-total" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">VAT ในยอดนี้</span>
              <MoneyInput value={vatSatang} onChangeSatang={setVatSatang} testId="inbox-create-vat" />
            </label>
          </div>
          <p className="text-sm text-[color:var(--color-muted)]">
            ยอดก่อน VAT <span className="font-semibold text-[color:var(--color-ink)] tabular-nums" data-testid="inbox-create-subtotal">{formatBaht(subtotal, { decimals: true })}</span>
          </p>
          {error && (
            <p className="text-sm text-[color:var(--color-danger)]" data-testid="inbox-create-error">
              {error}
            </p>
          )}
          <p className="text-xs text-[color:var(--color-muted)]">
            กดแล้วจะได้เอกสาร <strong>ร่าง</strong> พร้อมไฟล์นี้แนบอยู่ — ตรวจหมวดค่าใช้จ่ายแล้วค่อยกดออกเอกสารในหน้าถัดไป
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default InboxCreateExpenseSheet;
