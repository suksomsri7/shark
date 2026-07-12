import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getDocument, getSettings, DOC_LABEL, baht } from "@/lib/modules/account/service";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

// หน้าเอกสารสำหรับพิมพ์/บันทึก PDF (Ctrl+P) — B&W A4
// ใบกำกับภาษี (TAX_INVOICE): ครบตามมาตรา 86/4 ประมวลรัษฎากร
//   คำว่า "ใบกำกับภาษี" · เลขที่/เล่ม · ผู้ขาย(ชื่อ/ที่อยู่/เลขภาษี 13 หลัก/สาขา) · ผู้ซื้อเช่นกัน
//   · มูลค่าสินค้า+VAT แยกชัด · ตราประทับ/ลายเซ็น (ถ้ามี URL) · ออกเป็นชุด (ต้นฉบับ/สำเนา)
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ copy?: string }>;
}) {
  const { id, docId } = await params;
  const { copy } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const [doc, s] = await Promise.all([
    getDocument(tenantId, systemId, docId),
    getSettings(tenantId, systemId),
  ]);
  if (!doc) notFound();

  const isTaxInvoice = doc.docType === "TAX_INVOICE";
  // C4 (ม.86/10): ใบลดหนี้/ใบเพิ่มหนี้ ต้องอ้างเลข+วันที่ใบกำกับเดิม + เหตุผลการปรับ
  const isAdjustNote = doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE";
  const origDoc =
    isAdjustNote && doc.sourceDocId ? await getDocument(tenantId, systemId, doc.sourceDocId) : null;
  const snap = (doc.contactSnapshot as Record<string, unknown> | null) ?? null;
  const buyerName = (snap?.name as string) ?? doc.contact?.name ?? "";
  const buyerTax = (snap?.taxId as string) ?? doc.contact?.taxId ?? "";
  const buyerAddr = (snap?.address as string) ?? doc.contact?.address ?? "";
  const buyerBranchCode = (snap?.branchCode as string) ?? doc.contact?.branchCode ?? "";
  const buyerBranchName = (snap?.branchName as string) ?? doc.contact?.branchName ?? "";
  const buyerBranch =
    buyerBranchName ||
    (buyerBranchCode === "00000" ? "สำนักงานใหญ่" : buyerBranchCode ? `สาขา ${buyerBranchCode}` : "");

  const sellerBranch =
    s.branchName || (s.branchCode === "00000" ? "สำนักงานใหญ่" : s.branchCode ? `สาขา ${s.branchCode}` : "");

  // เอกสารออกเป็นชุด: ต้นฉบับ / สำเนา (?copy=1)
  const setLabel = copy === "1" ? "สำเนา (Copy)" : "ต้นฉบับ (Original)";

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-sm text-black">
      <div className="flex items-start justify-between border-b pb-4">
        <div className="flex items-start gap-3">
          {s.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logoUrl} alt="logo" className="h-14 w-14 object-contain" />
          )}
          <div>
            <div className="text-lg font-bold">{s.orgName || "กิจการของคุณ"}</div>
            {s.address && <div className="text-xs text-neutral-600">{s.address}</div>}
            {sellerBranch && <div className="text-xs text-neutral-600">{sellerBranch}</div>}
            {s.taxId && (
              <div className="text-xs text-neutral-600">เลขประจำตัวผู้เสียภาษี {s.taxId}</div>
            )}
            {s.phone && <div className="text-xs text-neutral-600">โทร {s.phone}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{DOC_LABEL[doc.docType] ?? "เอกสาร"}</div>
          {isTaxInvoice && <div className="text-xs font-medium">{setLabel}</div>}
          <div className="mt-1 text-xs">เลขที่ {doc.docNo ?? "(ร่าง)"}</div>
          <div className="text-xs">วันที่ {fmtDate(doc.issueDate)}</div>
          {doc.dueDate && <div className="text-xs">ครบกำหนด {fmtDate(doc.dueDate)}</div>}
          {doc.validUntil && <div className="text-xs">ยืนราคาถึง {fmtDate(doc.validUntil)}</div>}
        </div>
      </div>

      <div className="mt-4 rounded border p-3">
        <div className="text-xs text-neutral-600">{isTaxInvoice ? "ผู้ซื้อ / ลูกค้า" : "ลูกค้า"}</div>
        <div className="font-medium">{buyerName || "—"}</div>
        {buyerAddr && <div className="text-xs text-neutral-600">{buyerAddr}</div>}
        <div className="flex flex-wrap gap-x-6 text-xs text-neutral-600">
          {buyerTax && <span>เลขประจำตัวผู้เสียภาษี {buyerTax}</span>}
          {buyerBranch && <span>{buyerBranch}</span>}
        </div>
      </div>

      {isAdjustNote && (
        <div className="mt-3 rounded border border-neutral-300 p-3 text-xs">
          <div className="font-medium">อ้างอิงเอกสารเดิม (ตามมาตรา 86/10)</div>
          <div className="mt-1 flex flex-wrap gap-x-6 text-neutral-700">
            <span>เลขที่ใบกำกับภาษีเดิม: {origDoc?.docNo ?? doc.sourceDocId ?? "—"}</span>
            {origDoc?.issueDate && <span>ลงวันที่: {fmtDate(origDoc.issueDate)}</span>}
          </div>
          <div className="mt-1 text-neutral-700">
            เหตุผลการออก: {doc.adjustReason?.trim() || "—"}
          </div>
        </div>
      )}

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y">
            <th className="py-1 text-left">รายการ</th>
            <th className="py-1 text-right">จำนวน</th>
            <th className="py-1 text-right">ราคา/หน่วย</th>
            {s.vatRegistered && <th className="py-1 text-right">VAT</th>}
            <th className="py-1 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-1">{l.description}</td>
              <td className="py-1 text-right">
                {Number(l.qty)} {l.unitName ?? ""}
              </td>
              <td className="py-1 text-right">{baht(l.unitPrice)}</td>
              {s.vatRegistered && (
                <td className="py-1 text-right">
                  {l.vatRateBp < 0 ? "ยกเว้น" : l.vatRateBp === 0 ? "0%" : `${l.vatRateBp / 100}%`}
                </td>
              )}
              <td className="py-1 text-right">{baht(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col items-end gap-0.5 text-xs">
        <Row label="มูลค่าสินค้า/บริการ" value={baht(doc.subTotal)} />
        {doc.discountAmount > 0 && <Row label="ส่วนลด" value={`-${baht(doc.discountAmount)}`} />}
        {doc.depositDeducted > 0 && <Row label="หักเงินมัดจำ" value={`-${baht(doc.depositDeducted)}`} />}
        {s.vatRegistered && <Row label="ภาษีมูลค่าเพิ่ม (VAT)" value={baht(doc.vatAmount)} />}
        <div className="flex w-56 justify-between border-t pt-1 text-sm font-bold">
          <span>{s.vatRegistered ? "จำนวนเงินรวมทั้งสิ้น" : "ยอดสุทธิ"}</span>
          <span>฿{baht(doc.grandTotal)}</span>
        </div>
      </div>

      {doc.note && <div className="mt-4 text-xs text-neutral-600">หมายเหตุ: {doc.note}</div>}
      {s.footerNote && <div className="mt-1 text-xs text-neutral-600">{s.footerNote}</div>}

      <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
        <div className="flex flex-col items-center">
          <div className="relative flex h-16 w-full items-end justify-center">
            {s.stampUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.stampUrl} alt="ตราประทับ" className="absolute left-2 bottom-2 h-16 w-16 object-contain opacity-80" />
            )}
            {s.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.signatureUrl} alt="ลายเซ็น" className="h-12 object-contain" />
            )}
          </div>
          <div className="w-full border-t pt-1">ผู้รับเงิน / ผู้มีอำนาจลงนาม</div>
        </div>
        <div className="flex flex-col items-center justify-end">
          <div className="h-16 w-full" />
          <div className="w-full border-t pt-1">ผู้ซื้อ / ลูกค้า</div>
        </div>
      </div>

      {isTaxInvoice && (
        <div className="mt-4 text-center text-[10px] text-neutral-400 print:hidden">
          พิมพ์ชุดสำเนาได้โดยเติม ?copy=1 ท้าย URL
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-56 justify-between">
      <span className="text-neutral-600">{label}</span>
      <span>฿{value}</span>
    </div>
  );
}
