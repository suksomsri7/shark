import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { loadPrintView } from "@/lib/modules/account/print-view";
import { printEntry, recordDocPrint } from "@/lib/modules/account/print-log";
import { printStateOf } from "@/lib/modules/account/print-shared";
import { formatThaiDateLong } from "@/lib/ui/date";
import { PrintDocument, type PrintMark } from "@/components/account-v2/PrintDocument";
import { PrintToolbar } from "@/components/account-v2/PrintToolbar";

// ACCOUNT-FIX A4 — "พิมพ์ที่เลือก" ของหน้ารายการ: หลายใบในหน้าเดียว (ขึ้นหน้าใหม่ทุกใบ)
//   ทุกใบผ่านทางเดียวกับหน้าพิมพ์ทีละใบ: ร่าง = ลายน้ำร่าง · ยกเลิก = ลายน้ำยกเลิก · ใบที่ใช้อยู่ = บันทึกประวัติพิมพ์ (ใบกำกับ: ครั้งแรกต้นฉบับ ต่อไปสำเนา)
//   เพดาน 50 ใบต่อครั้ง (กันหน้าใหญ่เกิน) · id ที่ไม่ใช่ของสมุดนี้ถูกข้ามเงียบ ๆ (loadPrintView กรอง tenant/system)
const MAX = 50;

export default async function PrintBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId, userId } = await loadAccountSystem(id, { can: "account.doc.view" });
  const ids = [...new Set((sp.ids ?? "").split(",").map((x) => x.trim()).filter(Boolean))].slice(0, MAX);
  if (ids.length === 0) notFound();
  const ctx = { tenantId, systemId };

  const pages: { key: string; view: NonNullable<Awaited<ReturnType<typeof loadPrintView>>>["view"]; mark: PrintMark }[] = [];
  for (const docId of ids) {
    const loaded = await loadPrintView(tenantId, systemId, docId);
    if (!loaded) continue;
    const { doc, view } = loaded;
    const state = printStateOf(doc.status);
    let mark: PrintMark;
    if (state === "DRAFT") mark = { state: "DRAFT" };
    else if (state === "VOID") mark = { state: "VOID" };
    else {
      const rec = await recordDocPrint(ctx, doc.id, { request: "PRINT", channel: "SCREEN", actorId: userId });
      const entry = rec.ok ? await printEntry(ctx, doc.id, rec.printId) : null;
      mark =
        view.docTypeTaxInvoice && entry
          ? {
              state: "PRINT",
              kind: entry.kind,
              reprintNo: entry.reprintNo,
              substitute: entry.kind === "SUBSTITUTE" && entry.substituteSeq ? { seq: entry.substituteSeq, date: formatThaiDateLong(entry.substituteDate ?? entry.createdAt), reason: entry.substituteReason ?? "" } : null,
            }
          : { state: "PLAIN" };
    }
    pages.push({ key: doc.id, view, mark });
  }
  if (pages.length === 0) notFound();

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } [data-print-root], [data-print-root] * { visibility: visible !important; } [data-print-root] { position: absolute; left: 0; top: 0; width: 100%; } .print-batch-page { break-after: page; } }`}</style>
      <PrintToolbar label={`พิมพ์ ${pages.length} ใบ · ใบที่ออกแล้วบันทึกในประวัติเอกสาร${ids.length >= MAX ? ` (สูงสุด ${MAX} ใบต่อครั้ง)` : ""}`} auto={false} />
      <div data-print-root data-testid="print-batch">
        {pages.map((p) => (
          <div key={p.key} className="print-batch-page mb-6" data-testid="print-batch-doc">
            <PrintDocument view={p.view} mark={p.mark} />
          </div>
        ))}
      </div>
    </>
  );
}
