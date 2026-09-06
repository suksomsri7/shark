// ops/comments.ts — op ของ "ความเห็นในการ์ด": อ่านทั้งการ์ด · เขียน · แก้ · ลบ
//
// กติกา 4 ข้อของทุก op อยู่หัวไฟล์ `ops/boards.ts` (อ่านก่อน) — ของเฉพาะไฟล์นี้อีก 3 ข้อ:
//   · บริการใน `../../comments.ts` ตรวจบทบาทบอร์ดให้เองครบแล้ว (`assertCardRole … EDITOR` ตอนเขียน ·
//     `VIEWER` ตอนอ่าน · ลบ = ผู้เขียนหรือ ADMIN ของบอร์ด) ⇒ ห้ามตรวจซ้ำที่นี่
//   · คีย์สิทธิ์ = `kanban.card.comment` (ไม่ใช่ `kanban.card.update`) — หน้าจอยอมรับ **สองคีย์**
//     (`assertKanbanCanAny(auth, ["kanban.card.comment", "kanban.card.update"])`) เพราะร้านที่ตั้งสิทธิ์
//     ไว้ก่อน K1.8 ยังไม่มีคีย์ comment ให้ติ๊ก · แต่คีย์ API เป็นของใหม่ที่เจ้าของ **ติ๊ก scope เองทีละตัว**
//     ตอนออกคีย์ ⇒ ขอคีย์ตรงตัวได้เลย ไม่ต้องแบกความเข้ากันได้ย้อนหลังของหน้าจอเข้ามาใน API
//   · ความเห็นที่ถูกลบเป็น soft delete — `comments.list` ไม่คืนมาให้เห็นอีกเลย (เหมือนหน้าจอ)

import type { KanbanComment } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api/respond";
import { addComment, deleteComment, editComment, listComments } from "../../comments";
import { KANBAN_LIMITS } from "../../limits";
import { kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";
import { iso } from "../serialize";

/** `mentions` เก็บเป็นคอลัมน์ Json — คืนออก API เป็น string[] ล้วนเสมอ (แพตเทิร์นเดียวกับ `labelNames` ใน serialize.ts) */
function idList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

type ApiCommentRow = {
  id: string;
  cardId: string;
  body: string;
  authorUserId: string;
  authorName: string | null;
  mentions: string[];
  createdAt: string | null;
  editedAt: string | null;
};

/** แถวที่บริการคืนหลังเขียน/แก้ (ยังไม่ได้ resolve ชื่อคน → `authorName: null`) */
function commentRow(c: KanbanComment): ApiCommentRow {
  return {
    id: c.id,
    cardId: c.cardId,
    body: c.body,
    authorUserId: c.authorUserId,
    authorName: null,
    mentions: idList(c.mentions),
    createdAt: iso(c.createdAt),
    editedAt: iso(c.editedAt),
  };
}

const commentsList = defineKanbanOp({
  id: "comments.list",
  method: "GET",
  path: "/cards/{id}/comments",
  kind: "read",
  action: "kanban.board.read",
  summary: "Read every comment on a card, oldest first. Deleted comments are not returned.",
  label: "ความเห็นในการ์ด",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    const rows = await listComments(kanbanCtxOf(actor), params.id!);
    // 🔴 แปลงทีละช่องแม้ DTO จะเป็น string อยู่แล้ว — `KanbanCommentDto` เป็นสัญญาของ **หน้าจอ**
    //    (เปลี่ยนได้ตามที่จอต้องการ) ส่วนรูปร่างนี้คือสัญญาของ API ที่เปลี่ยนไม่ได้ (serialize.ts ข้อ 3)
    return rows.map((c) => ({
      id: c.id,
      cardId: params.id!,
      body: c.body,
      authorUserId: c.author.userId,
      authorName: c.author.name,
      mentions: c.mentions,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
    }));
  },
});

const commentBody = z
  .string()
  .trim()
  .min(1)
  .max(KANBAN_LIMITS.commentMaxChars)
  .describe("Comment text. Mention a person with the markup @[Name](userId); that person gets notified.");

const commentCreateInput = z.object({ body: commentBody }).strict();

const commentsCreate = defineKanbanOp({
  id: "comments.create",
  method: "POST",
  path: "/cards/{id}/comments",
  kind: "write",
  action: "kanban.card.comment",
  summary:
    "Write a comment on a card. The author is the user who created this API key, so a key with no owning user cannot comment.",
  label: "เขียนความเห็นในการ์ด",
  tool: { name: "kanban_add_comment", hint: "Use this to leave a note for the team on a task card." },
  input: commentCreateInput,
  test: "K1.15-S1.3",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    // 🔴 ข้อค้างจาก K1.8 (deviation ที่ Fable รับไว้ว่า "รอ K1.15 ตัดสิน"): `KanbanComment.authorUserId`
    //    เป็น NOT NULL แต่คีย์ API ไม่ใช่คน — ทางเลือกมีสอง
    //      (ก) เพิ่มคอลัมน์ `apiKeyId` nullable แล้วให้ความเห็น "ไม่มีผู้เขียนที่เป็นคน" ได้
    //      (ข) ผู้เขียน = **ผู้สร้างคีย์** (`ctx.actorUserId` ที่ `kanbanCtxOf` ใส่ให้)
    //    เลือก (ข): ความเห็นคือบทสนทนาของทีม — ทุกบรรทัดต้องมีคนรับผิดชอบที่ทักกลับได้จริง และการ์ดใบเดียว
    //    จะมี @mention/แจ้งเตือน/สิทธิ์ "แก้ได้เฉพาะของตัวเอง" ที่ยังทำงานเหมือนเดิมทุกจุดโดยไม่ต้องแก้สคีมา
    //    (ก) ทำให้ทุกจุดที่อ่านความเห็นต้องรองรับ "ผู้เขียนที่ไม่มีตัวตน" ไปตลอดกาล เพื่อกรณีเดียวคือคีย์เก่า
    // ⇒ คีย์รุ่นเก่าที่ไม่ได้บันทึกผู้สร้างไว้ ทำ op นี้ไม่ได้ และต้องบอกทางออกให้ชัดว่า "ออกคีย์ใหม่"
    if (!ctx.actorUserId) {
      throw new ApiError(
        403,
        "forbidden",
        "คีย์นี้ไม่ได้ผูกกับผู้ใช้คนใด — เขียนความเห็นผ่าน API ไม่ได้ (ความเห็นต้องมีผู้เขียนที่เป็นคนจริง) กรุณาสร้างคีย์ใหม่จากหน้าตั้งค่าเพื่อให้ระบบบันทึกผู้สร้างคีย์",
        "This API key has no owning user, so it cannot post comments. Create a new key from the settings page.",
        "สร้างคีย์ใหม่จากหน้า บอร์ดงาน › ตั้งค่า › API",
      );
    }
    const row = await addComment(ctx, params.id!, input.body);
    return commentRow(row);
  },
});

const commentUpdateInput = z.object({ body: commentBody }).strict();

const commentsUpdate = defineKanbanOp({
  id: "comments.update",
  method: "PATCH",
  path: "/comments/{id}",
  kind: "write",
  action: "kanban.card.comment",
  summary:
    "Edit a comment. Only the author can edit their own words, so this works only on comments written by the user who created this API key.",
  label: "แก้ความเห็น",
  input: commentUpdateInput,
  test: "K1.15-S1.2",
  async handler({ actor, params, input }) {
    // ไม่ต้องเช็ค `actorUserId` เองเหมือน `comments.create` — บริการเทียบ "ผู้เขียน = ผู้เรียก" อยู่แล้ว
    // และตอบ 403 ข้อความไทยที่อ่านรู้เรื่อง (คีย์ที่ไม่มีผู้สร้างย่อมไม่เท่ากับผู้เขียนคนไหนเลย)
    const row = await editComment(kanbanCtxOf(actor), params.id!, input.body);
    return commentRow(row);
  },
});

const commentsDelete = defineKanbanOp({
  id: "comments.delete",
  method: "DELETE",
  path: "/comments/{id}",
  // ลบ = soft delete (ประวัติกิจกรรมยังอ้างถึงได้) และเป็นข้อความบรรทัดเดียว ⇒ `write` ไม่ใช่ `danger`
  kind: "write",
  action: "kanban.card.comment",
  summary:
    "Delete a comment. Allowed for the author of the comment, or for a key that holds the board member management scope (board ADMIN).",
  label: "ลบความเห็น",
  test: "K1.15-S1.2",
  async handler({ actor, params }) {
    await deleteComment(kanbanCtxOf(actor), params.id!);
    return { ok: true, commentId: params.id! };
  },
});

export const COMMENTS_OPS: ApiOp[] = [commentsList, commentsCreate, commentsUpdate, commentsDelete];
