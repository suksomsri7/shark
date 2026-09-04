import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getDocument, getSettings, DOC_LABEL, baht, orgDisplayName } from "@/lib/modules/account/service";
import { EXP_DOC_LABEL } from "@/lib/modules/account/expense";
import { isGroupDocType } from "@/lib/modules/account/group";
import { formatThaiDateLong as fmtDate } from "@/lib/ui/date";
// WO 8.1 (§9.2 "รายงานเอกสาร"): เทมเพลต/ฟิลด์ที่แสดง/ภาษา + หมายเหตุ+เงื่อนไขต่อชนิด + ช่องทางบนเอกสาร
import { buildPrintOptions } from "@/lib/modules/account/print-options";
import { documentPaymentChannels } from "@/lib/modules/account/doc-settings";


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
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.doc.view" });
  const [doc, s] = await Promise.all([
    getDocument(tenantId, systemId, docId),
    getSettings(tenantId, systemId),
  ]);
  if (!doc) notFound();

  // ตัวเลือกการพิมพ์ตามตั้งค่าเอกสาร (§9.2) — เทมเพลต · ฟิลด์ที่แสดง · ภาษา · หมายเหตุ/เงื่อนไขของชนิดนี้
  const po = buildPrintOptions(s.doc, doc.docType, s.footerNote);
  const L = po.labels;
  // 🔴 WO 1.7 (§5.2 K): เอกสารกลุ่ม (ใบวางบิลรวม/ใบรวมจ่าย) มีตารางของตัวเอง — 1 บรรทัด = 1 ใบลูก
  //    ไม่ใช่ตารางสินค้า/บริการ · ป้ายไทยเขียนคำต่อคำไว้ตรงนี้ (เอกสาร · ยอดค้างชำระ · รวมยอดที่ต้องชำระ)
  //    เทมเพลตพิมพ์ของ §9.2 เปลี่ยนได้แค่ระยะ/ภาษา — ห้ามเปลี่ยนโครงตารางของกลุ่ม
  const G =
    po.language === "EN"
      ? { item: L.groupItem, outstanding: L.groupOutstanding, count: L.groupCount, grandTotal: L.groupGrandTotal }
      : { item: "เอกสาร", outstanding: "ยอดค้างชำระ", count: "จำนวนเอกสารในรายการ", grandTotal: "รวมยอดที่ต้องชำระ" };
  const channels = po.show.paymentChannels ? await documentPaymentChannels({ tenantId, systemId }) : [];

  const isTaxInvoice = doc.docType === "TAX_INVOICE";
  // C4 (ม.86/10): ใบลดหนี้/ใบเพิ่มหนี้ ต้องอ้างเลข+วันที่ใบกำกับเดิม + เหตุผลการปรับ
  const isAdjustNote = doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE";
  // WO 1.7 — เอกสารกลุ่ม (§5.2 K): 1 บรรทัด = 1 ใบลูก ⇒ ตารางเป็น "รายการเอกสาร" ไม่ใช่ "สินค้า/บริการ"
  // และไม่มี VAT ของตัวเอง (ภาษีอยู่ที่ใบลูกแล้ว) · ใบรวมจ่ายพิมพ์เป็น "ใบสำคัญจ่าย" ตาม §3
  const isGroup = isGroupDocType(doc.docType);
  const docTitle = isGroup && doc.docType === "COMBINED_PAYMENT"
    ? "ใบสำคัญจ่าย (ใบรวมจ่าย)"
    : DOC_LABEL[doc.docType] ?? EXP_DOC_LABEL[doc.docType] ?? "เอกสาร";
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
  const setLabel = copy === "1" ? L.copy : L.original;

  return (
    <div className={`mx-auto ${po.style.page}`} data-testid="print-page" data-template={po.template} data-lang={po.language}>
      <div className="flex items-start justify-between border-b pb-4">
        <div className="flex items-start gap-3">
          {po.show.logo && s.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logoUrl} alt="logo" className="h-14 w-14 object-contain" />
          )}
          <div>
            <div className="text-lg font-bold">{orgDisplayName(s) || "กิจการของคุณ"}</div>
            {s.address && <div className="text-xs text-neutral-600">{s.address}</div>}
            {sellerBranch && <div className="text-xs text-neutral-600">{sellerBranch}</div>}
            {s.taxId && (
              <div className="text-xs text-neutral-600">{L.taxId} {s.taxId}</div>
            )}
            {s.phone && <div className="text-xs text-neutral-600">{L.phone} {s.phone}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{docTitle}</div>
          {isTaxInvoice && <div className="text-xs font-medium">{setLabel}</div>}
          <div className="mt-1 text-xs">{L.docNo} {doc.docNo ?? "(ร่าง)"}</div>
          <div className="text-xs">{L.date} {fmtDate(doc.issueDate)}</div>
          {po.show.dueDate && doc.dueDate && <div className="text-xs">{L.dueDate} {fmtDate(doc.dueDate)}</div>}
          {po.show.dueDate && doc.validUntil && <div className="text-xs">{L.validUntil} {fmtDate(doc.validUntil)}</div>}
          {po.show.reference && doc.reference && <div className="text-xs">{L.reference} {doc.reference}</div>}
        </div>
      </div>

      <div className="mt-4 rounded border p-3">
        <div className="text-xs text-neutral-600">{isTaxInvoice ? L.buyerTax : L.buyer}</div>
        <div className="font-medium">{buyerName || "—"}</div>
        {po.show.buyerAddress && buyerAddr && <div className="text-xs text-neutral-600">{buyerAddr}</div>}
        <div className="flex flex-wrap gap-x-6 text-xs text-neutral-600">
          {po.show.buyerTaxId && buyerTax && <span>{L.taxId} {buyerTax}</span>}
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

      {isGroup ? (
        <table className={po.style.table} data-testid="print-group-lines">
          <thead>
            <tr className="border-y">
              <th className="py-1 text-left">{G.item}</th>
              <th className="py-1 text-right">{G.outstanding}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-1">{l.description}</td>
                <td className="py-1 text-right">{baht(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
      <table className={po.style.table} data-testid="print-lines">
        <thead>
          <tr className="border-y">
            {po.show.productImage && <th className="py-1 text-left" />}
            {po.show.productSku && <th className="py-1 text-left">{L.sku}</th>}
            <th className="py-1 text-left">{L.item}</th>
            <th className="py-1 text-right">{L.qty}</th>
            <th className="py-1 text-right">{L.unitPrice}</th>
            {s.vatRegistered && <th className="py-1 text-right">{L.vat}</th>}
            <th className="py-1 text-right">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.id} className="border-b">
              {po.show.productImage && (
                <td className="py-1">
                  {l.product?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.product.imageUrl} alt="" className="h-10 w-10 object-cover" />
                  )}
                </td>
              )}
              {po.show.productSku && <td className="py-1 text-neutral-600">{l.product?.sku ?? ""}</td>}
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
      )}

      <div className="mt-3 flex flex-col items-end gap-0.5 text-xs">
        {isGroup ? (
          <Row label={`${G.count} ${doc.lines.length} ${po.language === "EN" ? "" : "ใบ"}`.trim()} value={baht(doc.subTotal)} />
        ) : (
          <>
            <Row label={L.subTotal} value={baht(doc.subTotal)} />
            {doc.discountAmount > 0 && <Row label={L.discount} value={`-${baht(doc.discountAmount)}`} />}
            {doc.depositDeducted > 0 && <Row label={L.deposit} value={`-${baht(doc.depositDeducted)}`} />}
            {s.vatRegistered && <Row label={L.vatAmount} value={baht(doc.vatAmount)} />}
          </>
        )}
        <div className="flex w-56 justify-between border-t pt-1 text-sm font-bold">
          <span>{isGroup ? G.grandTotal : s.vatRegistered ? L.grandTotal : L.netTotal}</span>
          <span>฿{baht(doc.grandTotal)}</span>
        </div>
      </div>

      {po.show.note && doc.note && (
        <div className="mt-4 text-xs text-neutral-600">{L.note}: {doc.note}</div>
      )}
      {po.show.note && po.footerNote && (
        <div className="mt-1 text-xs text-neutral-600" data-testid="print-footer-note">{po.footerNote}</div>
      )}
      {po.show.paymentTerms && po.paymentTerms && (
        <div className="mt-1 text-xs text-neutral-600" data-testid="print-terms">
          {L.terms}: {po.paymentTerms}
        </div>
      )}
      {channels.length > 0 && (
        <div className="mt-2 rounded border p-2 text-xs text-neutral-700" data-testid="print-channels">
          <div className="font-medium">{L.channels}</div>
          {channels.map((c) => (
            <div key={c.id}>
              {[c.bankName, c.accountNo, c.accountName].filter(Boolean).join(" · ") ||
                c.promptpayId ||
                c.name}
            </div>
          ))}
        </div>
      )}
      {po.legalText && (
        <div className="mt-2 text-[10px] text-neutral-500" data-testid="print-legal">{po.legalText}</div>
      )}

      <div className={`${po.style.gapTop} grid grid-cols-2 gap-8 text-center text-xs`}>
        <div className="flex flex-col items-center">
          <div className="relative flex h-16 w-full items-end justify-center">
            {po.show.stamp && s.stampUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.stampUrl} alt="ตราประทับ" className="absolute left-2 bottom-2 h-16 w-16 object-contain opacity-80" />
            )}
            {po.show.signature && s.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.signatureUrl} alt="ลายเซ็น" className="h-12 object-contain" />
            )}
          </div>
          <div className="w-full border-t pt-1">{L.signature}</div>
        </div>
        <div className="flex flex-col items-center justify-end">
          <div className="h-16 w-full" />
          <div className="w-full border-t pt-1">{L.buyerSignature}</div>
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
