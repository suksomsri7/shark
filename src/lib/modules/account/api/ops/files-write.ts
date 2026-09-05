// ops/files-write.ts — WRITE คลังเอกสาร/กล่องขาเข้า (WO D3): แก้ไฟล์เดี่ยว/หลายไฟล์พร้อมกัน ·
//                       รับไฟล์จากช่องทางภายนอกเข้ากล่องขาเข้า · อ่านบิลด้วย AI · สร้างค่าใช้จ่ายจากไฟล์
//
// (การอ่าน — `files.list`/`inbox.get` — อยู่ที่ `settings-read.ts` ของ WO B4 แล้ว ที่นี่ไม่ทำซ้ำ)
//
// 🔴 กติกาของชั้นนี้:
//   1) ห้ามแตะ prisma ตรง ๆ (fitness F5) — ทุกอย่างผ่าน `../../attachment.ts` / `../../inbox.ts` / `../../inbox-ai.ts`
//   2) `files.update` รับได้หลายช่องพร้อมกันในคำขอเดียว (เช่น folder+docTypeHint) — ทำทีละ service call
//      ตามลำดับคงที่ แล้วอ่านแถวสุดท้ายกลับมาตอบทีเดียว (เหมือนหน้าจอที่กดหลายอย่างแล้วรีเฟรชครั้งเดียว)
//   3) `inbox.read` **ห้าม 500 เด็ดขาด** — `readBill` เขียนมาไม่ throw อยู่แล้ว แปลง status เป็น HTTP ที่นี่:
//      DONE → 200 · ไม่มีผู้ช่วย AI/เครดิตหมด/ชนเพดาน (SKIPPED) → 503 upstream_unavailable ·
//      อ่านไม่ออก/ชนิดไฟล์ไม่รองรับ (FAILED/UNSUPPORTED) → 422 unprocessable
//   4) userId ของ service ทุกจุด = `null`

import { z } from "zod";
import {
  archiveAttachment,
  archiveAttachmentsBulk,
  getAttachmentRow,
  linkAttachment,
  markNotAccounting,
  moveAttachment,
  moveAttachmentsBulk,
  restoreAttachment,
  setDocTypeHint,
  unlinkAttachment,
} from "../../attachment";
import type { AttachmentSource } from "../../attachment-shared";
import { createExpenseFromAttachment, ingestInboxFiles, type InboxIngestFile } from "../../inbox";
import { readBill } from "../../inbox-ai";
import { getDocRef } from "../../service";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { fileRowView } from "../serialize-gl";

function notFound(message_th: string): ApiError {
  return new ApiError(404, "not_found", message_th, "The requested record was not found in this accounting book.");
}

function stateConflict(message_th: string): ApiError {
  return new ApiError(409, "state_conflict", message_th, "The record is not in a state that allows this operation.");
}

/** ข้อความไทยจากชั้น attachment service — "ไม่พบ…" = 404 · "…แล้ว"/"…อยู่" (ผูก/ลบไปแล้ว) = 409 */
function failFile(reason: string): never {
  if (reason.startsWith("ไม่พบ")) throw notFound(reason);
  if (reason.includes("แล้ว") || reason.includes("ผูกกับเอกสารอยู่")) throw stateConflict(reason);
  throw new Error(reason);
}

// ── files.update ─────────────────────────────────────────────────────────

const filesUpdateInput = z
  .object({
    documentId: z.string().min(1).nullish().describe("Link the file to this document. Send null to unlink it."),
    folder: z.string().max(120).nullish().describe("Move the file into this folder. Send null to clear the folder."),
    archived: z.boolean().optional().describe("true archives (soft-deletes) the file, false restores it."),
    notAccounting: z.boolean().optional().describe("true flags the file as not an accounting document."),
    docTypeHint: z.string().max(60).nullish().describe("Document-type hint, only when the file is not linked to a document yet."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.documentId === undefined &&
      v.folder === undefined &&
      v.archived === undefined &&
      v.notAccounting === undefined &&
      v.docTypeHint === undefined
    ) {
      ctx.addIssue({ code: "custom", message: "ต้องระบุอย่างน้อย 1 ช่อง (documentId/folder/archived/notAccounting/docTypeHint)" });
    }
  });

const filesUpdate = defineOp({
  id: "files.update",
  method: "PATCH",
  path: "/files/{id}",
  kind: "write",
  action: "account.document.manage",
  summary:
    "Change one document-vault file: link/unlink it to a document, move it to a folder, archive/restore it, flag it as not accounting, or set its document-type hint. At least one field is required.",
  label: "แก้ไฟล์ในคลังเอกสาร",
  input: filesUpdateInput,
  test: "D3-R3.4",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    const { tenantId, systemId } = actor;

    if (input.documentId !== undefined) {
      const res =
        input.documentId === null
          ? await unlinkAttachment(tenantId, systemId, id, null)
          : await linkAttachment(tenantId, systemId, id, input.documentId, null);
      if (!res.ok) failFile(res.reason);
    }
    if (input.folder !== undefined) {
      const res = await moveAttachment(tenantId, systemId, id, input.folder);
      if (!res.ok) failFile(res.reason);
    }
    if (input.docTypeHint !== undefined) {
      const res = await setDocTypeHint(tenantId, systemId, id, input.docTypeHint, null);
      if (!res.ok) failFile(res.reason);
    }
    if (input.notAccounting === true) {
      const res = await markNotAccounting(tenantId, systemId, id, null);
      if (!res.ok) failFile(res.reason);
    }
    if (input.archived === true) {
      const res = await archiveAttachment(tenantId, systemId, id, null);
      if (!res.ok) failFile(res.reason);
    } else if (input.archived === false) {
      const res = await restoreAttachment(tenantId, systemId, id, null);
      if (!res.ok) failFile(res.reason);
    }

    const row = await getAttachmentRow(tenantId, systemId, id);
    if (!row) throw notFound("ไม่พบไฟล์");
    return fileRowView(row);
  },
});

// ── files.bulk ───────────────────────────────────────────────────────────

const filesBulkInput = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    folder: z.string().max(120).nullish().describe("Move every file to this folder."),
    archived: z.boolean().optional().describe("true archives every file in the list."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.folder === undefined && v.archived === undefined) {
      ctx.addIssue({ code: "custom", message: "ต้องระบุ folder หรือ archived อย่างน้อย 1 อย่าง" });
    }
  });

const filesBulk = defineOp({
  id: "files.bulk",
  method: "POST",
  path: "/files/bulk",
  kind: "write",
  action: "account.document.manage",
  summary: "Move or archive several document-vault files in one call.",
  label: "แก้ไฟล์หลายไฟล์พร้อมกัน",
  input: filesBulkInput,
  test: "D3-R3.6",
  async handler({ actor, input }) {
    let count = 0;
    if (input.folder !== undefined) {
      const res = await moveAttachmentsBulk(actor.tenantId, actor.systemId, input.ids, input.folder, null);
      count = res.count;
    }
    if (input.archived === true) {
      const res = await archiveAttachmentsBulk(actor.tenantId, actor.systemId, input.ids, null);
      count = res.count;
    }
    return { count };
  },
});

// ── inbox.ingest ─────────────────────────────────────────────────────────

const ingestFileInput = z
  .object({
    sourceRef: z.string().min(1).max(200).describe("Id of this file at the source (chat message id, email Message-ID, ...) — used to dedupe."),
    fileName: z.string().min(1).max(200),
    fileUrl: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), "fileUrl ต้องเป็น https")
      .describe("Publicly reachable https URL of the file."),
    mimeType: z.string().min(1).max(100),
    sizeBytes: z.number().int().min(0).optional(),
  })
  .strict();

const inboxIngestInput = z
  .object({
    source: z.enum(["UPLOAD", "EMAIL", "CHAT", "APP", "API"]),
    senderLabel: z.string().max(120).nullish().describe("Who/what sent this, shown on the inbox card."),
    files: z.array(ingestFileInput).min(1).max(50),
  })
  .strict();

const inboxIngest = defineOp({
  id: "inbox.ingest",
  method: "POST",
  path: "/inbox/files",
  kind: "write",
  action: "account.document.manage",
  summary:
    "Bring files from an external channel into the inbox. Safe to retry: a file whose sourceRef was already ingested is counted as duplicated instead of created again.",
  label: "รับไฟล์เข้ากล่องขาเข้า",
  input: inboxIngestInput,
  test: "D3-R3.1",
  async handler({ actor, input }) {
    const files: InboxIngestFile[] = input.files.map((f) => ({
      sourceRef: f.sourceRef,
      fileName: f.fileName,
      fileUrl: f.fileUrl,
      mimeType: f.mimeType,
      ...(f.sizeBytes !== undefined ? { sizeBytes: f.sizeBytes } : {}),
    }));
    return ingestInboxFiles(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { source: input.source as AttachmentSource, senderLabel: input.senderLabel ?? null, files },
    );
  },
});

// ── inbox.read ───────────────────────────────────────────────────────────

const inboxReadInput = z.object({ force: z.boolean().optional().describe("Read again even if this file was already read successfully.") }).strict();

const inboxRead = defineOp({
  id: "inbox.read",
  method: "POST",
  path: "/inbox/{fileId}/read",
  kind: "write",
  action: "account.document.manage",
  summary:
    "Have the AI assistant read one inbox photo and extract vendor, dates and amounts. Cached after the first successful read unless force is sent.",
  label: "อ่านบิลด้วย AI",
  tool: { name: "account_read_bill_image", hint: "Use for a photo of a bill sitting in the document inbox; it extracts vendor, dates and amounts. Proposed for confirmation." },
  input: inboxReadInput,
  test: "D3-R3.8",
  async handler({ actor, params, input }) {
    const fileId = params.fileId ?? "";
    const res = await readBill(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      fileId,
      { force: input.force ?? false, userId: null },
    );
    if (res.status === "FAILED" && res.reason === "ไม่พบไฟล์") throw notFound(res.reason);
    if (res.status === "DONE" && res.extract) {
      const e = res.extract;
      return {
        extracted: {
          vendor: e.vendorName,
          vendorTaxId: e.vendorTaxId,
          invoiceNo: e.invoiceNo,
          date: e.issueDate,
          totalSatang: e.totalSatang,
          vatSatang: e.vatSatang,
          vatRateBp: e.vatRateBp,
          docKind: e.docKind,
        },
        cached: res.cached,
      };
    }
    if (res.status === "SKIPPED") {
      throw new ApiError(503, "upstream_unavailable", res.reason ?? "ยังไม่ได้เปิดผู้ช่วย AI ของกิจการนี้", "No AI provider is configured for this reading.");
    }
    // FAILED (อ่านไม่ได้จริง ๆ) / UNSUPPORTED (ชนิดไฟล์ที่ AI อ่านไม่ได้)
    throw new ApiError(422, "unprocessable", res.reason ?? "อ่านไฟล์นี้ไม่สำเร็จ", "The file could not be read.");
  },
});

// ── inbox.create-expense ─────────────────────────────────────────────────

const createExpenseInput = z
  .object({
    vendorName: z.string().max(200).optional(),
    vendorTaxId: z.string().max(20).nullish(),
    vendorPhone: z.string().max(20).nullish(),
    invoiceNo: z.string().max(100).nullish(),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "issueDate ต้องเป็นวันที่รูปแบบ YYYY-MM-DD").nullish(),
    totalSatang: z.number().int().min(0).optional(),
    vatSatang: z.number().int().min(0).optional(),
    vatRateBp: z.number().int().min(0).max(10_000).optional(),
    docKind: z.enum(["RECEIPT", "TAX_INVOICE", "INVOICE", "SLIP", "OTHER"]).optional(),
    note: z.string().max(500).nullish(),
  })
  .strict();

const inboxCreateExpense = defineOp({
  id: "inbox.create-expense",
  method: "POST",
  path: "/inbox/{fileId}/create-expense",
  kind: "write",
  action: "account.doc.create",
  summary:
    "Confirm the AI proposal (or your own numbers) and issue a draft expense document from one inbox file. The file is linked to the document it creates and cannot be used to create a second one.",
  label: "สร้างบันทึกค่าใช้จ่ายจากกล่องขาเข้า",
  input: createExpenseInput,
  test: "D3-R3.9",
  async handler({ actor, params, input }) {
    const fileId = params.fileId ?? "";
    const res = await createExpenseFromAttachment(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      fileId,
      {
        vendorName: input.vendorName,
        vendorTaxId: input.vendorTaxId ?? undefined,
        vendorPhone: input.vendorPhone ?? undefined,
        invoiceNo: input.invoiceNo ?? undefined,
        issueDate: input.issueDate ?? undefined,
        totalSatang: input.totalSatang,
        vatSatang: input.vatSatang,
        vatRateBp: input.vatRateBp,
        docKind: input.docKind,
        note: input.note ?? undefined,
      },
      null,
    );
    if (!res.ok) failFile(res.reason);
    const doc = await getDocRef(actor.tenantId, actor.systemId, res.docId);
    if (!doc) throw notFound("ไม่พบเอกสารที่เพิ่งสร้าง");
    return { documentId: doc.id, type: doc.docType, status: doc.status, docNo: doc.docNo };
  },
});

export const FILES_WRITE_OPS: ApiOp[] = [filesUpdate, filesBulk, inboxIngest, inboxRead, inboxCreateExpense];
