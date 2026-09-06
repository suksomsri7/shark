// ops/attachments.ts — op ของ "ไฟล์แนบในการ์ด": รายการ · แนบไฟล์ · ลบ · ตั้ง/ล้างปกการ์ด
//
// กติกา 4 ข้อของทุก op อยู่หัวไฟล์ `ops/boards.ts` (อ่านก่อน) — ของเฉพาะไฟล์นี้อีก 3 ข้อ:
//   · บริการใน `../../attachments.ts` ตรวจบทบาทบอร์ดให้เองครบแล้ว (`assertCardRole … EDITOR` ตอนเขียน/ลบ/
//     ตั้งปก · `VIEWER` ตอนอ่าน) ⇒ ห้ามตรวจซ้ำที่นี่
//   · คีย์สิทธิ์ = `kanban.card.attach` — ตัวเดียวกับที่หน้าจอใช้ (`uploadAttachmentAction` ยอมรับ
//     `kanban.card.attach` **หรือ** `kanban.card.update` เพื่อไม่ให้ร้านที่ตั้งสิทธิ์ไว้ก่อน K1.9 แนบไฟล์ไม่ได้
//     หลัง deploy · คีย์ API เป็นของใหม่ที่เจ้าของติ๊ก scope เองตอนออกคีย์ ⇒ ขอคีย์ตรงตัวได้เลย)
//   · 🔴 REST ไม่มี multipart: ผู้เรียกส่งเนื้อไฟล์เป็น **base64 ในตัว JSON** แล้วเราถอดเป็นไบต์เอง
//     ก่อนเรียกบริการ — ด่านชนิดไฟล์/ขนาด/"ไบต์จริงตรงกับชนิดที่แจ้ง" (magic bytes) ยังเป็นของบริการ
//     เหมือนเดิมทุกข้อ ที่นี่ตรวจแค่ "ข้อความที่ส่งมาเป็น base64 จริงไหม และถอดแล้วใหญ่เกินเพดานไหม"
//     ซึ่งเป็นเรื่องของรูปแบบคำขอ (422 `validation`) ไม่ใช่เรื่องของไฟล์

import { z } from "zod";
import { ApiError } from "@/lib/api/respond";
import { normalizeUploadType } from "@/lib/storage/service";
import { addAttachment, listAttachments, removeAttachment, setCover } from "../../attachments";
import { KANBAN_LIMITS } from "../../limits";
import { kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

/** เพดานความยาวข้อความ base64 ที่ยอมรับ = เพดานไบต์ของโมดูล (10MB) แปลงกลับเป็นตัวอักษร + เผื่อ padding */
const MAX_BASE64_CHARS = Math.ceil(KANBAN_LIMITS.attachmentMaxBytes / 3) * 4 + 8;
const MAX_MB = Math.round(KANBAN_LIMITS.attachmentMaxBytes / (1024 * 1024));

/** base64 มาตรฐาน (RFC 4648) เท่านั้น — ไม่รับแบบ URL-safe (`-`/`_`) เพราะถอดผิดเงียบ ๆ ได้ */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function badBase64(message_th: string, hint: string): ApiError {
  return new ApiError(422, "validation", message_th, "The dataBase64 field is not valid base64 file content.", hint);
}

/**
 * ข้อความ base64 → ไบต์จริง
 * 🔴 `Buffer.from(x, "base64")` **ไม่เคยโยน error**: ตัวอักษรที่ไม่ใช่ base64 ถูกทิ้งเงียบ ๆ ⇒ ข้อความมั่ว ๆ
 *    จะกลายเป็นไฟล์ไม่กี่ไบต์ที่ไปตกด่าน "ไบต์ไม่ตรงกับชนิดที่แจ้ง" แล้วผู้เรียกได้ข้อความที่ชี้ผิดจุด
 *    (นึกว่าไฟล์เสีย ทั้งที่จริงคือ encode ผิด) — จึงต้องตรวจรูปแบบเองก่อนถอดเสมอ
 */
function decodeBase64(raw: string): Uint8Array {
  // ตัวเข้ารหัสหลายตัวขึ้นบรรทัดใหม่ทุก 76 ตัวอักษรตามแบบ MIME — ตัดช่องว่างทิ้งก่อนแล้วค่อยตัดสิน
  const compact = raw.replace(/\s+/g, "");
  if (compact.length === 0 || compact.length % 4 !== 0 || !BASE64_RE.test(compact)) {
    throw badBase64(
      "เนื้อไฟล์ที่ส่งมาไม่ใช่ base64 ที่ถูกต้อง — ส่งเฉพาะข้อความ base64 ของไฟล์ (ไม่ต้องมีส่วนนำหน้า `data:...;base64,`)",
      "encode ไฟล์เป็น base64 มาตรฐาน แล้วส่งเฉพาะส่วนข้อความใน dataBase64",
    );
  }
  const bytes = new Uint8Array(Buffer.from(compact, "base64"));
  if (bytes.length === 0) {
    throw badBase64("ไฟล์ที่ส่งมาว่างเปล่า — แนบไฟล์เปล่าไม่ได้", "ตรวจว่าอ่านไฟล์ครบทั้งไฟล์ก่อน encode");
  }
  if (bytes.length > KANBAN_LIMITS.attachmentMaxBytes) {
    throw new ApiError(
      422,
      "validation",
      `ไฟล์ใหญ่เกิน ${MAX_MB}MB — ย่อขนาดแล้วแนบใหม่ได้เลย`,
      `The file is larger than the ${MAX_MB}MB limit for one attachment.`,
      `ย่อไฟล์ให้เล็กกว่า ${MAX_MB}MB แล้วส่งใหม่`,
    );
  }
  return bytes;
}

type ApiAttachmentRow = {
  id: string;
  cardId: string;
  name: string;
  contentType: string;
  bytes: number;
  url: string;
  isCover: boolean;
  uploadedByName: string;
  createdAt: string;
};

const attachmentsList = defineKanbanOp({
  id: "attachments.list",
  method: "GET",
  path: "/cards/{id}/attachments",
  kind: "read",
  action: "kanban.board.read",
  summary: "List the files attached to a card, oldest first, with a public URL for each one.",
  label: "ไฟล์แนบในการ์ด",
  test: "K1.15-S1.2",
  async handler({ actor, params }): Promise<ApiAttachmentRow[]> {
    const rows = await listAttachments(kanbanCtxOf(actor), params.id!);
    // แปลงทีละช่อง: `KanbanAttachmentDto` เป็นสัญญาของหน้าจอ (เปลี่ยนตามที่จอต้องการได้)
    // ส่วนรูปร่างนี้คือสัญญาของ API ที่เปลี่ยนไม่ได้ (serialize.ts ข้อ 3)
    return rows.map((a) => ({
      id: a.id,
      cardId: params.id!,
      name: a.name,
      contentType: a.contentType,
      bytes: a.bytes,
      url: a.url,
      isCover: a.isCover,
      uploadedByName: a.uploadedBy.name,
      createdAt: a.createdAt,
    }));
  },
});

const attachmentCreateInput = z
  .object({
    filename: z.string().trim().min(1).max(200).describe("File name shown on the card, for example receipt.pdf."),
    contentType: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe("MIME type of the file, for example image/png. The real bytes must match it; a renamed file is rejected."),
    dataBase64: z
      .string()
      .min(1)
      .max(MAX_BASE64_CHARS)
      .describe(`File content, base64 encoded, without any data: prefix. Max ${MAX_MB}MB once decoded.`),
  })
  .strict();

const attachmentsCreate = defineKanbanOp({
  id: "attachments.create",
  method: "POST",
  path: "/cards/{id}/attachments",
  kind: "write",
  action: "kanban.card.attach",
  summary:
    "Attach one file to a card by sending its content base64 encoded. The file type must be an allowed one and its real bytes must match the declared contentType.",
  label: "แนบไฟล์เข้าการ์ด",
  input: attachmentCreateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }): Promise<ApiAttachmentRow> {
    const data = decodeBase64(input.dataBase64);
    // เดินเส้นเดียวกับ `uploadAttachmentAction`: ตัดพารามิเตอร์ท้าย Content-Type ทิ้งก่อน (`; charset=…`)
    // แล้วปล่อยให้บริการเป็นคนตัดสินว่าชนิดนี้แนบได้ไหม (ทะเบียนชนิดที่อนุญาตมีที่เดียวคือ storage)
    const contentType = normalizeUploadType(input.contentType) || "application/octet-stream";
    const row = await addAttachment(kanbanCtxOf(actor), params.id!, {
      filename: input.filename,
      contentType,
      data,
    });
    return {
      id: row.id,
      cardId: params.id!,
      name: row.name,
      contentType: row.contentType,
      bytes: row.bytes,
      url: row.url,
      isCover: row.isCover,
      uploadedByName: row.uploadedBy.name,
      createdAt: row.createdAt,
    };
  },
});

const attachmentsDelete = defineKanbanOp({
  id: "attachments.delete",
  method: "DELETE",
  path: "/attachments/{id}",
  // ลบไฟล์แนบเป็น soft delete และไฟล์ต้นฉบับยังอยู่ที่ผู้ส่ง ⇒ `write` ไม่ใช่ `danger`
  // (ถ้าไฟล์นั้นเป็นปกการ์ดอยู่ บริการเคลียร์ปกให้ในทรานแซกชันเดียวกันเอง)
  kind: "write",
  action: "kanban.card.attach",
  summary: "Remove one attachment from a card. If it was the card cover, the cover is cleared too.",
  label: "ลบไฟล์แนบ",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    await removeAttachment(kanbanCtxOf(actor), params.id!);
    return { ok: true, attachmentId: params.id! };
  },
});

const coverInput = z
  .object({
    attachmentId: z
      .string()
      .max(40)
      .nullable()
      .describe("Id of an image attachment of this card to use as its cover. Send null to remove the cover."),
  })
  .strict();

const cardsCover = defineKanbanOp({
  id: "cards.cover",
  method: "PUT",
  path: "/cards/{id}/cover",
  kind: "write",
  action: "kanban.card.attach",
  summary: "Set or clear the cover image of a card. Only an image attachment already on that card can be the cover.",
  label: "ตั้งปกการ์ด",
  input: coverInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    await setCover(kanbanCtxOf(actor), params.id!, input.attachmentId);
    return { ok: true, cardId: params.id!, attachmentId: input.attachmentId };
  },
});

export const ATTACHMENTS_OPS: ApiOp[] = [attachmentsList, attachmentsCreate, attachmentsDelete, cardsCover];
