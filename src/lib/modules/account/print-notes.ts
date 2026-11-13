// print-notes.ts — บรรทัดที่ต้องมีบนกระดาษของเลน 1 (ACC T2.8 + T2.2) · อ่านฐาน แล้วส่งเป็นข้อมูลให้ PrintDocument (คอมโพเนนต์บริสุทธิ์)
//
// เดิมเป็น PrintDocNotes.tsx (server component แทรก 2 จุดในหน้าพิมพ์) — รวมเข้า PrintView ตอน merge กับ T2.7 (หน้าพิมพ์แยก 3 ไฟล์)
//   draftBanner  ร่างของเอกสารที่ไม่ใช่ใบกำกับภาษี = ป้าย "ร่าง — ยังไม่ใช่เอกสารที่ออกแล้ว" (ร่างใบเสร็จไม่พิมพ์เป็นใบเสร็จ — checklist B4)
//                ใบกำกับภาษีใช้ป้าย "ร่าง — ยังไม่ใช่ใบกำกับภาษี" ของ T2.7 · ทุกชนิดมีลายน้ำ "ร่าง"
//   received     ใบเสร็จที่ออกแล้ว = "ได้รับเงินตามรายการข้างต้นแล้ว" + วันที่/ช่องทาง/ยอดที่รับ (ม.105 ทวิ · domain-accounting-books.md §ง1)
//   replacement  ใบกำกับที่ออกแทน = "ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ … ลงวันที่ … (เหตุผล)" — พิมพ์เสมอ (ไม่ขึ้นกับสวิตช์ "หมายเหตุ")
//                และตัดบรรทัดเดียวกันออกจากหมายเหตุของใบ (ไม่พิมพ์ซ้ำ) · ใบที่ถูกแทน = "ยกเลิก — ออกฉบับใหม่แทนเลขที่ …" (ป.86/2542 ข้อ 25 · common-vat-invoice.md §14)
import { tenantDb } from "@/lib/core/db";
import { formatThaiDateLong as fmtDate } from "@/lib/ui/date";
import { listDocPayments } from "./service";

/** หมายเหตุของใบกำกับที่ออกแทน (เก็บใน note ของใบใหม่ตอนออก — ตัวอักษรเดียวกับที่พิมพ์) */
export const REPLACEMENT_NOTE_PREFIX = "ออกแทนใบกำกับภาษีฉบับเดิมเลขที่";

export const DRAFT_BANNER_TEXT = "ร่าง — ยังไม่ใช่เอกสารที่ออกแล้ว · ไม่ใช่หลักฐานการรับเงินหรือใบกำกับภาษี";

const CHANNEL_TH: Record<string, string> = { CASH: "เงินสด", TRANSFER: "โอนเงิน", CHEQUE: "เช็ค", CARD: "บัตร", E_WALLET: "e-Wallet", PROMPTPAY: "พร้อมเพย์", DEPOSIT_APPLY: "หักเงินมัดจำ", CREDIT_APPLY: "หักเครดิต", OTHER: "อื่น ๆ" };
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type PrintNotes = {
  draftBanner: string | null;
  /** null = ไม่ใช่ใบเสร็จที่ออกแล้ว */
  received: string[] | null;
  replacementNote: string | null;
  replacedBy: string | null;
};

type Doc = {
  id: string;
  tenantId: string;
  systemId: string;
  docType: string;
  status: string;
  sourceDocId: string | null;
  sourcePaymentId?: string | null;
  replacedById?: string | null;
  issueDate: Date;
  grandTotal: number;
};

export async function loadPrintNotes(doc: Doc): Promise<PrintNotes> {
  const { tenantId, systemId } = doc;
  const db = tenantDb({ tenantId, systemId });
  const out: PrintNotes = { draftBanner: null, received: null, replacementNote: null, replacedBy: null };
  if (doc.status === "DRAFT") {
    if (doc.docType !== "TAX_INVOICE") out.draftBanner = DRAFT_BANNER_TEXT;
    return out;
  }
  if (doc.docType === "RECEIPT" && doc.status !== "VOIDED" && doc.status !== "CANCELLED") {
    const own = (await listDocPayments(tenantId, systemId, doc.id)).filter((p) => !p.voidedAt);
    const pays =
      own.length > 0
        ? own
        : doc.sourcePaymentId && doc.sourceDocId
          ? (await listDocPayments(tenantId, systemId, doc.sourceDocId)).filter((p) => p.id === doc.sourcePaymentId && !p.voidedAt)
          : [];
    out.received =
      pays.length > 0
        ? pays.map(
            (p) =>
              `รับเมื่อ ${fmtDate(p.paidAt)} · ${p.financeName ?? CHANNEL_TH[p.channel] ?? p.channel}${p.chequeNo ? ` เลขที่ ${p.chequeNo}` : ""} · ฿${baht(p.amount)}${p.whtAmount > 0 ? ` · ภาษีถูกหัก ณ ที่จ่าย ฿${baht(p.whtAmount)}` : ""}`,
          )
        : [`รับเมื่อ ${fmtDate(doc.issueDate)} · ฿${baht(doc.grandTotal)}`];
  }
  if (doc.docType === "TAX_INVOICE") {
    const replaced = await db.accountDocument.findFirst({ where: { docType: "TAX_INVOICE", replacedById: doc.id }, select: { docNo: true, issueDate: true, voidReason: true } });
    if (replaced) out.replacementNote = `${REPLACEMENT_NOTE_PREFIX} ${replaced.docNo ?? "-"} ลงวันที่ ${fmtDate(replaced.issueDate)}${replaced.voidReason ? ` · เหตุผล: ${replaced.voidReason}` : ""}`;
    if (doc.replacedById) {
      const nw = await db.accountDocument.findFirst({ where: { id: doc.replacedById }, select: { docNo: true } });
      out.replacedBy = `ยกเลิก — ออกใบกำกับภาษีฉบับใหม่แทนแล้ว เลขที่ ${nw?.docNo ?? "-"}`;
    }
  }
  return out;
}

/** ตัดบรรทัด "ออกแทนใบกำกับภาษีฉบับเดิม…" ออกจากหมายเหตุของใบ เมื่อพิมพ์บรรทัดนั้นแยกแล้ว (ไม่ซ้ำ) */
export function stripReplacementNote(note: string | null | undefined, replacementNote: string | null): string | null {
  if (!note) return null;
  if (!replacementNote) return note;
  const kept = note
    .split("\n")
    .filter((l) => !l.trim().startsWith(REPLACEMENT_NOTE_PREFIX))
    .join("\n")
    .trim();
  return kept || null;
}
