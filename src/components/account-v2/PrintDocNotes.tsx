// PrintDocNotes.tsx — ชิ้นเล็กแยกตัวของหน้าพิมพ์เอกสาร (เลน 1 · ACC T2.8 + T2.2) · server component
//
// ทำไมแยกไฟล์: โครงหน้าพิมพ์ (หัว/ท้าย/ข้อความกฎหมาย/สำเนา) เป็นงานของเลน 2 (T2.7) — เลน 1 เติมแค่ "บรรทัดที่ต้องมี" ผ่านชิ้นนี้
//   แทรก 2 จุดในหน้าพิมพ์: slot="head" (ใต้หัวเอกสาร) · slot="foot" (ใต้ยอดรวม) — ไม่แตะสไตล์/โครงเดิม
//   head: ร่าง = ป้าย "ร่าง — ยังไม่ใช่เอกสารที่ออกแล้ว" (ร่างใบเสร็จไม่พิมพ์เป็นใบเสร็จ — checklist B4)
//   foot: ใบเสร็จที่ออกแล้ว = "ได้รับเงินตามรายการข้างต้นแล้ว" + วันที่/ช่องทาง/ยอดที่รับ (ม.105 ทวิ · domain-accounting-books.md §ง1)
//         ใบกำกับที่ออกแทน = "ออกแทนฉบับเดิมเลขที่ … ลงวันที่ … (เหตุผล)" · ใบที่ถูกแทน = "ยกเลิก — ออกฉบับใหม่แทนเลขที่ …" (ป.86/2542 ข้อ 25 · common-vat-invoice.md §14)
import { prisma } from "@/lib/core/db";
import { listDocPayments } from "@/lib/modules/account/service";
import { formatThaiDateLong as fmtDate } from "@/lib/ui/date";

type Doc = {
  id: string;
  docType: string;
  status: string;
  docNo: string | null;
  sourceDocId: string | null;
  sourcePaymentId?: string | null;
  replacedById?: string | null;
  issueDate: Date;
  grandTotal: number;
  note?: string | null;
};

const CHANNEL_TH: Record<string, string> = { CASH: "เงินสด", TRANSFER: "โอนเงิน", CHEQUE: "เช็ค", CARD: "บัตร", E_WALLET: "e-Wallet", PROMPTPAY: "พร้อมเพย์", DEPOSIT_APPLY: "หักเงินมัดจำ", CREDIT_APPLY: "หักเครดิต", OTHER: "อื่น ๆ" };
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** หมายเหตุของใบกำกับที่ออกแทน (เก็บใน note ของใบใหม่ตอนออก — ตัวอักษรเดียวกับที่พิมพ์) */
export const REPLACEMENT_NOTE_PREFIX = "ออกแทนใบกำกับภาษีฉบับเดิมเลขที่";

export async function PrintDocNotes({ tenantId, systemId, doc, slot }: { tenantId: string; systemId: string; doc: Doc; slot: "head" | "foot" }) {
  if (slot === "head") {
    if (doc.status !== "DRAFT") return null;
    return (
      <div className="mt-2 rounded border border-neutral-400 p-2 text-center text-xs font-medium" data-testid="print-draft-mark">
        ร่าง — ยังไม่ใช่เอกสารที่ออกแล้ว · ไม่ใช่หลักฐานการรับเงินหรือใบกำกับภาษี
      </div>
    );
  }
  const out: React.ReactNode[] = [];
  if (doc.docType === "RECEIPT" && doc.status !== "DRAFT" && doc.status !== "VOIDED" && doc.status !== "CANCELLED") {
    const own = (await listDocPayments(tenantId, systemId, doc.id)).filter((p) => !p.voidedAt);
    const pays = own.length > 0
      ? own
      : doc.sourcePaymentId && doc.sourceDocId
        ? (await listDocPayments(tenantId, systemId, doc.sourceDocId)).filter((p) => p.id === doc.sourcePaymentId && !p.voidedAt)
        : [];
    out.push(
      <div key="rcv" className="mt-3 rounded border p-2 text-xs" data-testid="print-received">
        <div className="font-medium">ได้รับเงินตามรายการข้างต้นแล้ว</div>
        {pays.length > 0 ? (
          pays.map((p) => (
            <div key={p.id} className="text-neutral-700">
              รับเมื่อ {fmtDate(p.paidAt)} · {p.financeName ?? CHANNEL_TH[p.channel] ?? p.channel}
              {p.chequeNo ? ` เลขที่ ${p.chequeNo}` : ""} · ฿{baht(p.amount)}
              {p.whtAmount > 0 ? ` · ภาษีถูกหัก ณ ที่จ่าย ฿${baht(p.whtAmount)}` : ""}
            </div>
          ))
        ) : (
          <div className="text-neutral-700">รับเมื่อ {fmtDate(doc.issueDate)} · ฿{baht(doc.grandTotal)}</div>
        )}
      </div>,
    );
  }
  if (doc.docType === "TAX_INVOICE") {
    const replaced = await prisma.accountDocument.findFirst({
      where: { tenantId, systemId, docType: "TAX_INVOICE", replacedById: doc.id },
      select: { docNo: true, issueDate: true, voidReason: true },
    });
    if (replaced)
      out.push(
        <div key="rep" className="mt-2 text-xs" data-testid="print-replacement-note">
          {REPLACEMENT_NOTE_PREFIX} {replaced.docNo ?? "-"} ลงวันที่ {fmtDate(replaced.issueDate)}
          {replaced.voidReason ? ` · เหตุผล: ${replaced.voidReason}` : ""}
        </div>,
      );
    if (doc.replacedById) {
      const nw = await prisma.accountDocument.findFirst({ where: { id: doc.replacedById, tenantId, systemId }, select: { docNo: true } });
      out.push(
        <div key="was" className="mt-2 text-xs font-medium" data-testid="print-replaced-by">
          ยกเลิก — ออกใบกำกับภาษีฉบับใหม่แทนแล้ว เลขที่ {nw?.docNo ?? "-"}
        </div>,
      );
    }
  }
  return out.length ? <>{out}</> : null;
}
