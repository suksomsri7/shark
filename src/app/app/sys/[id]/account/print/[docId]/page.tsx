import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getDocument, getSettings, DOC_LABEL, baht } from "@/lib/modules/account/service";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

// หน้าเอกสารสำหรับพิมพ์/บันทึก PDF (Ctrl+P) — B&W A4
export default async function PrintPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const [doc, s] = await Promise.all([
    getDocument(tenantId, systemId, docId),
    getSettings(tenantId, systemId),
  ]);
  if (!doc) notFound();

  const snap = (doc.contactSnapshot as Record<string, unknown> | null) ?? null;
  const buyerName = (snap?.name as string) ?? doc.contact?.name ?? "";
  const buyerTax = (snap?.taxId as string) ?? doc.contact?.taxId ?? "";
  const buyerAddr = (snap?.address as string) ?? doc.contact?.address ?? "";

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-sm text-black">
      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <div className="text-lg font-bold">{s.orgName || "กิจการของคุณ"}</div>
          {s.address && <div className="text-xs text-neutral-600">{s.address}</div>}
          {s.taxId && <div className="text-xs text-neutral-600">เลขผู้เสียภาษี {s.taxId}</div>}
          {s.phone && <div className="text-xs text-neutral-600">โทร {s.phone}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{DOC_LABEL[doc.docType]}</div>
          <div className="text-xs">เลขที่ {doc.docNo ?? "(ร่าง)"}</div>
          <div className="text-xs">วันที่ {fmtDate(doc.issueDate)}</div>
          {doc.dueDate && <div className="text-xs">ครบกำหนด {fmtDate(doc.dueDate)}</div>}
          {doc.validUntil && <div className="text-xs">ยืนราคาถึง {fmtDate(doc.validUntil)}</div>}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-neutral-600">ลูกค้า</div>
        <div className="font-medium">{buyerName || "—"}</div>
        {buyerTax && <div className="text-xs text-neutral-600">เลขผู้เสียภาษี {buyerTax}</div>}
        {buyerAddr && <div className="text-xs text-neutral-600">{buyerAddr}</div>}
      </div>

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y">
            <th className="py-1 text-left">รายการ</th>
            <th className="py-1 text-right">จำนวน</th>
            <th className="py-1 text-right">ราคา/หน่วย</th>
            <th className="py-1 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-1">{l.description}</td>
              <td className="py-1 text-right">{Number(l.qty)} {l.unitName ?? ""}</td>
              <td className="py-1 text-right">{baht(l.unitPrice)}</td>
              <td className="py-1 text-right">{baht(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col items-end gap-0.5 text-xs">
        <Row label="รวมเป็นเงิน" value={baht(doc.subTotal)} />
        {doc.discountAmount > 0 && <Row label="ส่วนลด" value={`-${baht(doc.discountAmount)}`} />}
        <Row label="ภาษีมูลค่าเพิ่ม" value={baht(doc.vatAmount)} />
        <div className="flex w-56 justify-between border-t pt-1 text-sm font-bold">
          <span>ยอดสุทธิ</span>
          <span>฿{baht(doc.grandTotal)}</span>
        </div>
      </div>

      {doc.note && <div className="mt-4 text-xs text-neutral-600">หมายเหตุ: {doc.note}</div>}
      {s.footerNote && <div className="mt-1 text-xs text-neutral-600">{s.footerNote}</div>}

      <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
        <div className="border-t pt-1">ผู้รับเงิน / ผู้มีอำนาจลงนาม</div>
        <div className="border-t pt-1">ลูกค้า</div>
      </div>
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
