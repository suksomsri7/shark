// print-log.ts — ACC T2.7 · บันทึกการพิมพ์เอกสาร (ต้นฉบับ/สำเนา/ชุด/ใบแทน/ต้นฉบับพิมพ์ซ้ำ) · server เท่านั้น
//
// · ตัดสินชนิดในธุรกรรมที่ล็อกเอกสาร (advisory lock ต่อเอกสาร) + unique บางส่วน "ต้นฉบับแถวเดียว" ที่ DB ⇒ กดพร้อมกันสองเครื่อง ได้ต้นฉบับใบเดียว
// · ทุกแถว = AuditLog `account.doc.print.<kind>` (เป้า AccountDocument) ⇒ ขึ้นในแท็บ "ประวัติ" ของเอกสาร (ใคร · เมื่อไร · ชนิด · ช่องทาง)
// · พิมพ์ต้นฉบับซ้ำ = คำเตือน TAX_INVOICE_ORIGINAL_REPRINT [V] ต้องกดยืนยัน (ไม่บล็อก) · ใบแทนต้องมีสาเหตุ (ข้อมูลที่ใบแทนต้องมี = ความถูกต้องของเอกสาร)
// design note ledger/wo-notes/T2.7.md
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { isLegalAckRequiredError, legalWarning, type LegalAck, type LegalAckRequired } from "@/lib/core/settings/legal/warnings";
import { legalAckResult, legalGateInTx } from "./legal-gate";
import { decidePrintKind, printStateOf, type PrintChannel, type PrintKind, type PrintRequest } from "./print-shared";

type Ctx = { tenantId: string; systemId: string };

export type PrintRow = {
  id: string;
  kind: PrintKind;
  channel: PrintChannel;
  substituteSeq: number | null;
  substituteReason: string | null;
  substituteDate: Date | null;
  actorId: string | null;
  createdAt: Date;
};

export type RecordPrintResult =
  | { ok: true; printId: string; kind: PrintKind; substituteSeq: number | null; reprintNo: number | null }
  | { ok: false; reason: string; code?: "DRAFT" | "NOT_FOUND" | "REASON_REQUIRED"; legal?: LegalAckRequired };

const ROW_SELECT = { id: true, kind: true, channel: true, substituteSeq: true, substituteReason: true, substituteDate: true, actorId: true, createdAt: true } as const;

export async function recordDocPrint(
  ctx: Ctx,
  docId: string,
  input: {
    request: PrintRequest;
    channel: PrintChannel;
    actorId: string | null;
    actorType?: "USER" | "API_KEY" | "SYSTEM";
    substitute?: { reason: string; date?: Date | null } | null;
    ack?: LegalAck | null;
  },
): Promise<RecordPrintResult> {
  const db = tenantDb(ctx);
  const doc = await db.accountDocument.findFirst({
    where: { id: docId },
    select: { id: true, status: true, docType: true, docNo: true },
  });
  if (!doc) return { ok: false, code: "NOT_FOUND", reason: "ไม่พบเอกสาร" };
  if (printStateOf(doc.status) === "DRAFT") return { ok: false, code: "DRAFT", reason: "เอกสารร่างพิมพ์ได้เป็นร่างเท่านั้น — ไม่บันทึกเป็นต้นฉบับ/สำเนา" };
  const reason = (input.substitute?.reason ?? "").trim().slice(0, 200);
  if (input.request === "SUBSTITUTE" && !reason) return { ok: false, code: "REASON_REQUIRED", reason: "ใบแทนต้องมีสาเหตุย่อ (ม.86/12 · ประกาศ VAT ฉ.36)" };
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`acc:doc-print:${doc.id}`}))) l`;
      const prev = await tx.accountDocumentPrint.findMany({ where: { documentId: doc.id }, select: { kind: true, substituteSeq: true } });
      const hasOriginal = prev.some((p) => p.kind === "ORIGINAL" || p.kind === "SET");
      const kind = decidePrintKind(input.request, hasOriginal);
      if (kind === "ORIGINAL_REPRINT") {
        const n = prev.filter((p) => p.kind === "ORIGINAL_REPRINT").length + 1;
        await legalGateInTx(tx, ctx.tenantId, [legalWarning("TAX_INVOICE_ORIGINAL_REPRINT", { docNo: doc.docNo ?? "-", n })], input.ack, {
          op: "account.doc.print",
          targetType: "AccountDocument",
          targetId: doc.id,
        });
      }
      const seq = kind === "SUBSTITUTE" ? Math.max(0, ...prev.map((p) => p.substituteSeq ?? 0)) + 1 : null;
      const row = await tx.accountDocumentPrint.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          documentId: doc.id,
          kind,
          channel: input.channel,
          substituteSeq: seq,
          substituteReason: kind === "SUBSTITUTE" ? reason : null,
          substituteDate: kind === "SUBSTITUTE" ? (input.substitute?.date ?? new Date()) : null,
          actorId: input.actorId,
          actorType: input.actorType ?? "USER",
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorId: input.actorId,
          actorType: input.actorType ?? "USER",
          action: `account.doc.print.${kind.toLowerCase()}`,
          targetType: "AccountDocument",
          targetId: doc.id,
          after: { printId: row.id, kind, channel: input.channel, ...(seq ? { substituteSeq: seq, reason } : {}) } as Prisma.InputJsonValue,
        },
      });
      const reprintNo = kind === "ORIGINAL_REPRINT" ? prev.filter((p) => p.kind === "ORIGINAL_REPRINT").length + 1 : null;
      return { ok: true as const, printId: row.id, kind, substituteSeq: seq, reprintNo };
    });
  } catch (e) {
    if (isLegalAckRequiredError(e)) return legalAckResult(e);
    // แข่งกันพิมพ์ต้นฉบับ (unique บางส่วน) — อีกเครื่องได้ต้นฉบับไปแล้ว ⇒ ครั้งนี้เป็นสำเนา
    if ((e as { code?: string })?.code === "P2002" && (input.request === "PRINT" || input.request === "SET")) return recordDocPrint(ctx, docId, { ...input, request: "COPY" });
    throw e;
  }
}

/** แถวการพิมพ์หนึ่งแถวของเอกสาร (หน้าพิมพ์อ่านชนิดจากแถวนี้ — รีเฟรชไม่สร้างต้นฉบับใหม่) */
export async function printEntry(ctx: Ctx, docId: string, printId: string): Promise<(PrintRow & { reprintNo: number | null }) | null> {
  const db = tenantDb(ctx);
  const row = await db.accountDocumentPrint.findFirst({ where: { id: printId, documentId: docId }, select: ROW_SELECT });
  if (!row) return null;
  const reprintNo =
    row.kind === "ORIGINAL_REPRINT"
      ? await db.accountDocumentPrint.count({ where: { documentId: docId, kind: "ORIGINAL_REPRINT", createdAt: { lte: row.createdAt } } })
      : null;
  return { ...row, reprintNo };
}

/** ประวัติการพิมพ์ของเอกสาร (ใหม่ → เก่า) */
export async function listDocPrints(ctx: Ctx, docId: string): Promise<PrintRow[]> {
  return tenantDb(ctx).accountDocumentPrint.findMany({ where: { documentId: docId }, select: ROW_SELECT, orderBy: { createdAt: "desc" } });
}

/** ต้นฉบับพิมพ์แล้วหรือยัง (ปุ่มพิมพ์บนหน้ารายละเอียดบอก "ต้นฉบับ"/"สำเนา") */
export async function originalPrinted(ctx: Ctx, docId: string): Promise<boolean> {
  return (await tenantDb(ctx).accountDocumentPrint.count({ where: { documentId: docId, kind: { in: ["ORIGINAL", "SET"] } } })) > 0;
}
