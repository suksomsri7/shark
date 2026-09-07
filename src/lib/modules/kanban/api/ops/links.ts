// ops/links.ts — op ของ "เชื่อมข้อมูล SHARK" (K3.1): ดู/ผูก/ถอด ของที่การ์ดอ้างถึงในโมดูลอื่น
//
// กติกาเดียวกับ `ops/cards.ts` (อ่านหัวไฟล์นั้นก่อน) — เพิ่ม 2 ข้อที่เป็นของการเชื่อมโดยเฉพาะ:
//   · `links.ts`/`link-resolvers.ts` ตรวจบทบาทบอร์ดเองครบแล้ว (อ่าน = VIEWER · ผูก/ถอด = EDITOR ·
//     มองบอร์ดไม่เห็น = 404) ⇒ ไม่ต้อง `assertCardRole` ซ้ำที่นี่
//   · 🔴 **สิทธิ์ของปลายทางคิดจากคีย์ที่ยิงมา ไม่ใช่จากคนที่ออกคีย์**: `kanbanActorOf` ประกอบ actor จาก
//     scope ของคีย์ ⇒ คีย์ที่มีแต่ scope ของบอร์ดงาน จะเห็นแถวเชื่อมครบ แต่เป็น "(ไม่มีสิทธิ์เข้าถึง)"
//     ทุกแถวที่ปลายทางเป็นโมดูลอื่น (ไม่มีชื่อลูกค้า/ยอดเงิน/ลิงก์ติดออกไป) — ตั้งใจให้เป็นแบบนี้

import { z } from "zod";
import { addLink, removeLink } from "../../links";
import { LINK_TYPE_KINDS, listCardLinks } from "../../link-resolvers";
import type { KanbanLinkKind, KanbanLinkRole } from "../../types";
import { kanbanActorOf, kanbanCtxOf } from "../actor";
import { defineKanbanOp, type ApiOp } from "../op";

const linkTypeEnum = z
  .enum(LINK_TYPE_KINDS as [KanbanLinkKind, ...KanbanLinkKind[]])
  .describe("What kind of SHARK object the card points at. Use URL for a plain web link.");

const cardsLinksList = defineKanbanOp({
  id: "cards.links.list",
  method: "GET",
  path: "/cards/{id}/links",
  kind: "read",
  action: "kanban.board.read",
  summary:
    "List everything this card is linked to (contact, chat, accounting document, approval request, external URL and so on). Rows the caller may not open are still returned, but without any detail: canView is false, title says the Thai equivalent of 'no access', and href is null.",
  label: "รายการเชื่อมข้อมูลของการ์ด",
  test: "K3.1-S6.2",
  async handler({ actor, params }) {
    const ctx = kanbanCtxOf(actor);
    return { links: await listCardLinks(ctx, kanbanActorOf(actor), params.id!) };
  },
});

const cardsLinksAddInput = z
  .object({
    linkType: linkTypeEnum,
    linkId: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe("Id of the target object in this shop. For linkType URL this is the URL itself and must start with http:// or https://."),
    role: z
      .enum(["SOURCE", "RELATED", "RESULT"])
      .optional()
      .describe("SOURCE = the card was created out of this, RELATED = it refers to it, RESULT = it is the outcome of the work."),
    label: z.string().trim().max(120).optional().describe("Short caption typed by a person. Mostly used with URL links."),
  })
  .strict();

const cardsLinksAdd = defineKanbanOp({
  id: "cards.links.add",
  method: "POST",
  path: "/cards/{id}/links",
  kind: "write",
  action: "kanban.card.update",
  summary:
    "Link this card to an object elsewhere in SHARK, or to an external URL. Linking the same object twice returns the existing link instead of creating a second one. The target must exist in this shop.",
  label: "เชื่อมข้อมูลกับการ์ด",
  input: cardsLinksAddInput,
  test: "K3.1-S6.2",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    const row = await addLink(ctx, params.id!, {
      linkType: input.linkType,
      linkId: input.linkId,
      role: (input.role as KanbanLinkRole | undefined) ?? null,
      label: input.label ?? null,
    });
    return { ok: true, linkId: row.id, links: await listCardLinks(ctx, kanbanActorOf(actor), params.id!) };
  },
});

const cardsLinksRemoveInput = z
  .object({
    linkRowId: z.string().min(1).max(40).describe("Id of the link row itself, as returned by the list endpoint."),
  })
  .strict();

const cardsLinksRemove = defineKanbanOp({
  id: "cards.links.remove",
  method: "DELETE",
  path: "/cards/{id}/links",
  kind: "write",
  action: "kanban.card.update",
  summary:
    "Unlink one object from this card. The link is kept in the card history and linking the same object again revives the same row. Removing a link twice is a no-op.",
  label: "ถอดการเชื่อมข้อมูล",
  input: cardsLinksRemoveInput,
  test: "K3.1-S6.2",
  async handler({ actor, params, input }) {
    const ctx = kanbanCtxOf(actor);
    await removeLink(ctx, params.id!, input.linkRowId);
    return { ok: true, links: await listCardLinks(ctx, kanbanActorOf(actor), params.id!) };
  },
});

export const LINKS_OPS: ApiOp[] = [cardsLinksList, cardsLinksAdd, cardsLinksRemove];
