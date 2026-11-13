// PrintDocument.tsx — หน้ากระดาษของเอกสารบัญชี (A4 ขาวดำ) · ACC T2.7 แยกจาก /account/print/[docId]/page.tsx
//
// คอมโพเนนต์บริสุทธิ์ (ไม่มี hook · ไม่อ่านฐาน) ⇒ ข้อสอบเรนเดอร์ด้วย react-dom/server แล้วตรวจข้อความบนกระดาษได้ตรง
// ใบกำกับภาษี (TAX_INVOICE): ป้ายต้นฉบับ / "สำเนาใบกำกับภาษี" + "เอกสารออกเป็นชุด" / ใบแทน (ครั้งที่ วันที่ สาเหตุ ลายมือชื่อ) — skill common-vat-invoice.md §14
// ร่าง: ลายน้ำ "ร่าง" · ไม่มีป้ายต้นฉบับ/สำเนา · ยกเลิก: ป้ายยกเลิก
// design note ledger/wo-notes/T2.7.md (+ T1.8b §4 แถวกลุ่มอัตรา · T2.3 กล่องมูลค่าใบลด/เพิ่มหนี้ · T2.10 ข้อความ ม.86/4)
import type { PrintLabels, PrintOptions } from "@/lib/modules/account/print-options";
import { SET_WORDING, type PrintKind } from "@/lib/modules/account/print-shared";
import type { VatSummaryRow } from "@/lib/modules/account/totals";
import type { PrintNotes } from "@/lib/modules/account/print-notes";

export type PrintMark =
  | { state: "DRAFT" }
  | { state: "VOID" }
  | { state: "PLAIN" } // เอกสารที่ไม่มีป้ายชุด (ไม่ใช่ใบกำกับ) — พิมพ์แบบเดิม
  | { state: "PREVIEW" } // ตัวอย่างในหน้าตั้งค่า — ไม่บันทึกการพิมพ์ · ไม่อ้างต้นฉบับ/สำเนา
  | { state: "PRINT"; kind: PrintKind; reprintNo?: number | null; substitute?: { seq: number; date: string; reason: string } | null };

export type PrintAdjustBlock = {
  /** "มาตรา 86/10" / "มาตรา 86/9" (จากตารางค่ากฎหมาย) */
  sectionText: string;
  /** ชื่อชนิดจริงของเอกสารเดิม (ใบกำกับภาษี/ใบแจ้งหนี้/…) — null = ไม่ได้อ้างอิงเอกสารในระบบ */
  origKindLabel: string | null;
  origDocNo: string | null;
  origDate: string | null;
  reasonText: string;
  /** สตางค์ก่อน VAT · null = ไม่มีใบเดิมให้คิด */
  originalValue: number | null;
  correctValue: number | null;
  difference: number;
  differenceVat: number;
  priorNotes: number;
  isCredit: boolean;
};

export type PrintView = {
  po: PrintOptions;
  docTitle: string;
  docTypeTaxInvoice: boolean;
  isGroup: boolean;
  groupLabels: { item: string; outstanding: string; count: string; grandTotal: string; unit: string };
  docNo: string | null;
  issueDateText: string;
  dueDateText: string | null;
  validUntilText: string | null;
  reference: string | null;
  seller: { name: string; address: string | null; branch: string; taxId: string | null; phone: string | null; logoUrl: string | null };
  buyer: { name: string; address: string; taxId: string; branch: string };
  lines: { id: string; description: string; qty: string; unitName: string; unitPrice: string; vatCell: string | null; amount: string; imageUrl: string | null; sku: string }[];
  totals: { subTotal: string; discount: string | null; deposit: string | null; vatRows: (VatSummaryRow & { text: string })[]; grandTotal: string; grandLabel: string };
  note: string | null;
  footerNote: string | null;
  paymentTerms: string | null;
  channels: string[];
  legalText: string | null;
  sectionText: string | null;
  stampUrl: string | null;
  signatureUrl: string | null;
  adjust: PrintAdjustBlock | null;
  /** เลน 1 (T2.8/T2.2): ป้ายร่างของเอกสารที่ไม่ใช่ใบกำกับ · ได้รับเงินแล้ว (ใบเสร็จ) · ออกแทน/ถูกแทน (ใบกำกับ) */
  docNotes?: PrintNotes;
  money: (satang: number) => string;
};

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex w-56 justify-between" data-testid={testId}>
      <span className="text-neutral-600">{label}</span>
      <span>฿{value}</span>
    </div>
  );
}

function SetHeader({ mark, docTypeTaxInvoice, lang, hasDraftBanner }: { mark: PrintMark; docTypeTaxInvoice: boolean; lang: "TH" | "EN"; hasDraftBanner?: boolean }) {
  const W = SET_WORDING[lang];
  // merge ▸ ร่างใบกำกับ = ป้ายนี้ · ร่างชนิดอื่นที่มีป้ายเลน 1 (draftBanner ใต้หัว) ไม่พิมพ์ป้ายซ้ำ ◂
  if (mark.state === "DRAFT") return docTypeTaxInvoice || !hasDraftBanner ? <div className="text-xs font-bold" data-testid="print-set-label">{docTypeTaxInvoice ? W.draftNote : W.draftNoteGeneric}</div> : null;
  if (mark.state === "VOID") return <div className="text-xs font-bold" data-testid="print-set-label">{W.voided}</div>;
  if (mark.state === "PREVIEW") return <div className="text-xs font-bold" data-testid="print-set-label">{W.preview}</div>;
  if (mark.state !== "PRINT" || !docTypeTaxInvoice) return null;
  if (mark.kind === "COPY")
    return (
      <div className="text-xs font-bold" data-testid="print-set-label">
        <div>{W.copyTitle}</div>
        <div>{W.issuedAsSet}</div>
      </div>
    );
  if (mark.kind === "SUBSTITUTE") return <div className="text-xs font-bold" data-testid="print-set-label">{W.substituteTitle}</div>;
  if (mark.kind === "ORIGINAL_REPRINT")
    return (
      <div className="text-xs font-bold" data-testid="print-set-label">
        <div>{W.original}</div>
        <div className="font-normal">{W.reprint(mark.reprintNo ?? 1)}</div>
      </div>
    );
  return <div className="text-xs font-bold" data-testid="print-set-label">{W.original}</div>;
}

function Page({ v, mark, L }: { v: PrintView; mark: PrintMark; L: PrintLabels }) {
  const po = v.po;
  const lang = po.language;
  const W = SET_WORDING[lang];
  return (
    <div className={`relative mx-auto ${po.style.page} print-doc-page`} data-testid="print-page" data-template={po.template} data-lang={lang} data-print-state={mark.state} data-print-kind={mark.state === "PRINT" ? mark.kind : ""}>
      {mark.state === "DRAFT" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="print-draft-watermark">
          <span className="-rotate-30 select-none text-[120px] font-bold text-neutral-200">{W.draft}</span>
        </div>
      )}
      <div className="relative flex items-start justify-between border-b pb-4">
        <div className="flex items-start gap-3">
          {po.show.logo && v.seller.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.seller.logoUrl} alt="logo" loading="lazy" className="h-14 w-14 object-contain" />
          )}
          <div>
            <div className="text-lg font-bold">{v.seller.name}</div>
            {v.seller.address && <div className="text-xs text-neutral-600">{v.seller.address}</div>}
            {v.seller.branch && <div className="text-xs text-neutral-600">{v.seller.branch}</div>}
            {v.seller.taxId && (
              <div className="text-xs text-neutral-600">
                {L.taxId} {v.seller.taxId}
              </div>
            )}
            {v.seller.phone && (
              <div className="text-xs text-neutral-600">
                {L.phone} {v.seller.phone}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold" data-testid="print-title">{v.docTitle}</div>
          <SetHeader mark={mark} docTypeTaxInvoice={v.docTypeTaxInvoice} lang={lang} hasDraftBanner={mark.state === "DRAFT" && !!v.docNotes?.draftBanner} />
          <div className="mt-1 text-xs" data-testid="print-doc-no">
            {L.docNo} {v.docNo ?? `(${W.draft})`}
          </div>
          <div className="text-xs">
            {L.date} {v.issueDateText}
          </div>
          {v.dueDateText && (
            <div className="text-xs" data-testid="print-due">
              {L.dueDate} {v.dueDateText}
            </div>
          )}
          {v.validUntilText && (
            <div className="text-xs">
              {L.validUntil} {v.validUntilText}
            </div>
          )}
          {v.reference && (
            <div className="text-xs">
              {L.reference} {v.reference}
            </div>
          )}
        </div>
      </div>

      {mark.state === "DRAFT" && v.docNotes?.draftBanner && (
        <div className="relative mt-2 rounded border border-neutral-400 p-2 text-center text-xs font-medium" data-testid="print-draft-mark">
          {v.docNotes.draftBanner}
        </div>
      )}

      {mark.state === "PRINT" && mark.kind === "SUBSTITUTE" && mark.substitute && v.docTypeTaxInvoice && (
        <div className="relative mt-3 rounded border border-neutral-400 p-3 text-xs" data-testid="print-substitute">
          <div className="font-bold">{W.substituteSeq(mark.substitute.seq)}</div>
          <div className="mt-1 flex flex-wrap gap-x-6">
            <span>
              {W.substituteDate}: {mark.substitute.date}
            </span>
            <span>
              {W.substituteRef} {v.docNo ?? "—"} {W.substituteRefDate} {v.issueDateText}
            </span>
          </div>
          <div className="mt-1">
            {W.substituteReason}: {mark.substitute.reason}
          </div>
          <div className="mt-6 w-64 border-t pt-1 text-center">{W.substituteSign}</div>
        </div>
      )}

      <div className="relative mt-4 rounded border p-3">
        <div className="text-xs text-neutral-600">{v.docTypeTaxInvoice ? L.buyerTax : L.buyer}</div>
        <div className="font-medium">{v.buyer.name || "—"}</div>
        {po.show.buyerAddress && v.buyer.address && <div className="text-xs text-neutral-600">{v.buyer.address}</div>}
        <div className="flex flex-wrap gap-x-6 text-xs text-neutral-600">
          {po.show.buyerTaxId && v.buyer.taxId && (
            <span>
              {L.taxId} {v.buyer.taxId}
            </span>
          )}
          {v.buyer.branch && <span>{v.buyer.branch}</span>}
        </div>
      </div>

      {v.adjust && (
        <div className="relative mt-3 rounded border border-neutral-300 p-3 text-xs" data-testid="print-adjust">
          <div className="font-medium">อ้างอิงเอกสารเดิม (ตาม{v.adjust.sectionText})</div>
          <div className="mt-1 flex flex-wrap gap-x-6 text-neutral-700">
            {v.adjust.origKindLabel ? (
              <span data-testid="print-adjust-orig">
                เลขที่{v.adjust.origKindLabel}เดิม: {v.adjust.origDocNo ?? "—"}
              </span>
            ) : (
              <span data-testid="print-adjust-orig">ไม่ได้อ้างอิงเอกสารเดิมในระบบ{v.reference ? ` (อ้างอิง ${v.reference})` : ""}</span>
            )}
            {v.adjust.origDate && <span>ลงวันที่: {v.adjust.origDate}</span>}
          </div>
          <div className="mt-1 text-neutral-700">เหตุผลการออก: {v.adjust.reasonText || "—"}</div>
          <table className="mt-2 w-full text-xs" data-testid="print-adjust-values">
            <tbody>
              {v.adjust.originalValue !== null && (
                <tr>
                  <td className="py-0.5">
                    มูลค่าสินค้า/บริการตามเอกสารเดิม{v.adjust.priorNotes > 0 ? ` (รวมการปรับปรุงก่อนหน้า ${v.adjust.priorNotes} ฉบับ)` : ""}
                  </td>
                  <td className="py-0.5 text-right">฿{v.money(v.adjust.originalValue)}</td>
                </tr>
              )}
              {v.adjust.correctValue !== null && (
                <tr>
                  <td className="py-0.5">มูลค่าที่ถูกต้อง</td>
                  <td className="py-0.5 text-right">฿{v.money(v.adjust.correctValue)}</td>
                </tr>
              )}
              <tr>
                <td className="py-0.5">ผลต่าง</td>
                <td className="py-0.5 text-right">฿{v.money(v.adjust.difference)}</td>
              </tr>
              <tr>
                <td className="py-0.5">{v.adjust.isCredit ? "ภาษีมูลค่าเพิ่มของผลต่าง (ภาษีที่ลดลง)" : "ภาษีมูลค่าเพิ่มของผลต่าง (ภาษีที่เพิ่มขึ้น)"}</td>
                <td className="py-0.5 text-right">฿{v.money(v.adjust.differenceVat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {v.isGroup ? (
        <table className={`relative ${po.style.table}`} data-testid="print-group-lines">
          <thead>
            <tr className="border-y">
              <th className="py-1 text-left">{v.groupLabels.item}</th>
              <th className="py-1 text-right">{v.groupLabels.outstanding}</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-1">{l.description}</td>
                <td className="py-1 text-right">{l.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className={`relative ${po.style.table}`} data-testid="print-lines">
          <thead>
            <tr className="border-y">
              {po.show.productImage && <th className="py-1 text-left" />}
              {po.show.productSku && <th className="py-1 text-left">{L.sku}</th>}
              <th className="py-1 text-left">{L.item}</th>
              <th className="py-1 text-right">{L.qty}</th>
              <th className="py-1 text-right">{L.unitPrice}</th>
              {v.lines.some((l) => l.vatCell !== null) && <th className="py-1 text-right">{L.vat}</th>}
              <th className="py-1 text-right">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l) => (
              <tr key={l.id} className="border-b">
                {po.show.productImage && (
                  <td className="py-1">
                    {l.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imageUrl} alt="" className="h-10 w-10 object-cover" loading="lazy" decoding="async" />
                    )}
                  </td>
                )}
                {po.show.productSku && <td className="py-1 text-neutral-600">{l.sku}</td>}
                <td className="py-1">{l.description}</td>
                <td className="py-1 text-right">
                  {l.qty} {l.unitName}
                </td>
                <td className="py-1 text-right">{l.unitPrice}</td>
                {l.vatCell !== null && <td className="py-1 text-right">{l.vatCell}</td>}
                <td className="py-1 text-right">{l.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="relative mt-3 flex flex-col items-end gap-0.5 text-xs" data-testid="print-totals">
        {v.isGroup ? (
          <Row label={`${v.groupLabels.count} ${v.lines.length} ${v.groupLabels.unit}`.trim()} value={v.totals.subTotal} />
        ) : (
          <>
            <Row label={L.subTotal} value={v.totals.subTotal} />
            {v.totals.discount && <Row label={L.discount} value={`-${v.totals.discount}`} />}
            {v.totals.deposit && <Row label={L.deposit} value={`-${v.totals.deposit}`} />}
            {v.totals.vatRows.map((r) => (
              <Row key={r.key} label={r.label} value={r.text} testId={`print-${r.key}`} />
            ))}
          </>
        )}
        <div className="flex w-56 justify-between border-t pt-1 text-sm font-bold">
          <span>{v.isGroup ? v.groupLabels.grandTotal : v.totals.grandLabel}</span>
          <span>฿{v.totals.grandTotal}</span>
        </div>
      </div>

      {v.docNotes?.received && (
        <div className="relative mt-3 rounded border p-2 text-xs" data-testid="print-received">
          <div className="font-medium">ได้รับเงินตามรายการข้างต้นแล้ว</div>
          {v.docNotes.received.map((r, i) => (
            <div key={i} className="text-neutral-700">
              {r}
            </div>
          ))}
        </div>
      )}
      {v.docNotes?.replacementNote && (
        <div className="relative mt-2 text-xs" data-testid="print-replacement-note">
          {v.docNotes.replacementNote}
        </div>
      )}
      {v.docNotes?.replacedBy && (
        <div className="relative mt-2 text-xs font-medium" data-testid="print-replaced-by">
          {v.docNotes.replacedBy}
        </div>
      )}
      {v.note && (
        <div className="relative mt-4 text-xs text-neutral-600" data-testid="print-note">
          {L.note}: {v.note}
        </div>
      )}
      {v.footerNote && (
        <div className="relative mt-1 text-xs text-neutral-600" data-testid="print-footer-note">
          {v.footerNote}
        </div>
      )}
      {v.paymentTerms && (
        <div className="relative mt-1 text-xs text-neutral-600" data-testid="print-terms">
          {L.terms}: {v.paymentTerms}
        </div>
      )}
      {v.channels.length > 0 && (
        <div className="relative mt-2 rounded border p-2 text-xs text-neutral-700" data-testid="print-channels">
          <div className="font-medium">{L.channels}</div>
          {v.channels.map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
      )}
      {(v.legalText || v.sectionText) && (
        <div className="relative mt-2 text-[10px] text-neutral-500" data-testid="print-legal">
          {[v.legalText, v.sectionText].filter(Boolean).join(" · ")}
        </div>
      )}

      <div className={`relative ${po.style.gapTop} grid grid-cols-2 gap-8 text-center text-xs`}>
        <div className="flex flex-col items-center">
          <div className="relative flex h-16 w-full items-end justify-center">
            {po.show.stamp && v.stampUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.stampUrl} alt="ตราประทับ" className="absolute bottom-2 left-2 h-16 w-16 object-contain opacity-80" />
            )}
            {po.show.signature && v.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.signatureUrl} alt="ลายเซ็น" className="h-12 object-contain" />
            )}
          </div>
          <div className="w-full border-t pt-1">{L.signature}</div>
        </div>
        <div className="flex flex-col items-center justify-end">
          <div className="h-16 w-full" />
          <div className="w-full border-t pt-1">{L.buyerSignature}</div>
        </div>
      </div>
    </div>
  );
}

/** ทั้งงานพิมพ์ — ชุด (SET) = หน้าต้นฉบับ + หน้าสำเนา ในงานพิมพ์เดียว (ขึ้นหน้าใหม่ก่อนสำเนา) */
export function PrintDocument({ view, mark }: { view: PrintView; mark: PrintMark }) {
  const L = view.po.labels;
  if (mark.state === "PRINT" && mark.kind === "SET" && view.docTypeTaxInvoice) {
    return (
      <div data-testid="print-set">
        <Page v={view} mark={{ state: "PRINT", kind: "ORIGINAL" }} L={L} />
        <div className="break-before-page" style={{ breakBefore: "page" }} />
        <Page v={view} mark={{ state: "PRINT", kind: "COPY" }} L={L} />
      </div>
    );
  }
  return <Page v={view} mark={mark} L={L} />;
}
