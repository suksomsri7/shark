import { notFound, redirect } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { loadPrintView } from "@/lib/modules/account/print-view";
import { printEntry, recordDocPrint } from "@/lib/modules/account/print-log";
import { PRINT_CHANNEL_LABEL_TH, PRINT_KIND_LABEL_TH, printStateOf } from "@/lib/modules/account/print-shared";
import { formatThaiDateLong } from "@/lib/ui/date";
import { PrintDocument, type PrintMark } from "@/components/account-v2/PrintDocument";
import { PrintToolbar } from "@/components/account-v2/PrintToolbar";

// หน้าเอกสารสำหรับพิมพ์/บันทึก PDF (Ctrl+P) — B&W A4 · เนื้อกระดาษ = PrintDocument (ACC T2.7)
// ใบกำกับภาษี: ครั้งแรก = ต้นฉบับ · ครั้งต่อไป = "สำเนาใบกำกับภาษี" + "เอกสารออกเป็นชุด" · ใบแทน · ร่าง = ลายน้ำ (skill common-vat-invoice.md §14)
//   ?p=<printId>  แถวการพิมพ์ที่ปุ่มบนหน้ารายละเอียดสร้างไว้ (รีเฟรชไม่สร้างต้นฉบับใหม่) · &auto=1 เปิดกล่องพิมพ์ทันที
//   ไม่มี p (ลิงก์เก่า/พิมพ์จาก URL) = บันทึกการพิมพ์ช่องทางหน้าจอ แล้วพาไป ?p= · ?copy=1 เดิม = ขอสำเนา · ?preview=1 = ตัวอย่างในหน้าตั้งค่า (ไม่บันทึก)
// โครงแอป (เมนู · เบรดครัมบ์ · ปุ่มลอย) ไม่ขึ้นบนกระดาษ — @media print ซ่อนทุกอย่างนอก [data-print-root] (จอนอกข้อ 1–2)
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ copy?: string; p?: string; auto?: string; preview?: string }>;
}) {
  const { id, docId } = await params;
  const sp = await searchParams;
  const { tenantId, systemId, userId } = await loadAccountSystem(id, { can: "account.doc.view" });
  const loaded = await loadPrintView(tenantId, systemId, docId);
  if (!loaded) notFound();
  const { doc, view } = loaded;
  const state = printStateOf(doc.status);

  let mark: PrintMark;
  let toolbar = "";
  if (sp.preview === "1") {
    mark = { state: "PREVIEW" };
    toolbar = "ตัวอย่างการพิมพ์ (ไม่บันทึกประวัติ)";
  } else if (state === "DRAFT") {
    mark = { state: "DRAFT" };
    toolbar = "ร่าง — พิมพ์เป็นร่างเท่านั้น";
  } else if (state === "VOID") {
    mark = { state: "VOID" };
    toolbar = "เอกสารนี้ยกเลิกแล้ว";
  } else {
    const entry = sp.p ? await printEntry({ tenantId, systemId }, doc.id, sp.p) : null;
    if (!entry) {
      const rec = await recordDocPrint({ tenantId, systemId }, doc.id, { request: sp.copy === "1" ? "COPY" : "PRINT", channel: "SCREEN", actorId: userId });
      if (!rec.ok) notFound();
      redirect(`/app/sys/${id}/account/print/${doc.id}?p=${rec.printId}${sp.auto === "1" ? "&auto=1" : ""}`);
    }
    mark = view.docTypeTaxInvoice
      ? {
          state: "PRINT",
          kind: entry.kind,
          reprintNo: entry.reprintNo,
          substitute: entry.kind === "SUBSTITUTE" && entry.substituteSeq ? { seq: entry.substituteSeq, date: formatThaiDateLong(entry.substituteDate ?? entry.createdAt), reason: entry.substituteReason ?? "" } : null,
        }
      : { state: "PLAIN" };
    toolbar = `${view.docTypeTaxInvoice ? PRINT_KIND_LABEL_TH[entry.kind] : "พิมพ์"} · ${PRINT_CHANNEL_LABEL_TH[entry.channel]} · บันทึกในประวัติเอกสารแล้ว`;
  }

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } [data-print-root], [data-print-root] * { visibility: visible !important; } [data-print-root] { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <PrintToolbar label={toolbar} auto={sp.auto === "1"} />
      <div data-print-root>
        <PrintDocument view={view} mark={mark} />
      </div>
    </>
  );
}
