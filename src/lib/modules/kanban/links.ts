// links.ts — "เชื่อมข้อมูล SHARK" ฝั่งเขียน + facade ที่โมดูลอื่นเรียก (K3.1)
//             พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.1 · สัญญา `ledger/KANBAN-RUN.md` §K3.1
//
// ฝั่ง **อ่าน** + ทะเบียนชนิด 20 ตัว + ตัวแปลผล อยู่ที่ `link-resolvers.ts` (ไฟล์นี้ re-export ให้ผู้เรียก
// เห็นเป็นทางเข้าเดียว) — แยกกันเพราะฝั่งเขียนต้องเรียก `service.createCard` ซึ่งลากไปถึง `cards.ts`
// ส่วน `cards.ts` เองต้องอ่านการเชื่อมกลับมาแสดงในหลังการ์ด ⇒ รวมไฟล์เดียวจะเป็น import วนกลับ
//
// 🔴 ทิศทางเดียว: โมดูลอื่น → บอร์ดงาน เท่านั้น (แชท/ฟอร์ม/อนุมัติ เรียก `createCardFromExternal` ที่นี่)
//    ไฟล์นี้ **ห้าม** import โมดูลอื่นนอกจาก facade ของผู้ติดต่อ (`@/lib/modules/party`) — ด่าน fitness F2
//    เฝ้าอยู่ · ของที่ต้องอ่านจากโมดูลอื่นทำผ่านตัวแปลผลใน `link-resolvers.ts` (prisma ตรง อ่านอย่างเดียว)

import { safeFindOrCreate, searchByName } from "@/lib/modules/party";
import { logActivity } from "./activity-log";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertBoardRole, assertCardRole } from "./members";
import { keysBetween } from "./ordering";
import { setCardAssignees } from "./cards";
import { setCardLabels } from "./labels";
import { sanitizeDescription } from "./sanitize";
import { createCard } from "./service";
import { LINK_TYPES, targetExists } from "./link-resolvers";
import type { KanbanCardSourceType } from "@prisma/client";
import type { KanbanCtx, KanbanLinkKind, KanbanLinkRole } from "./types";

// ── ทางเข้าเดียว: ผู้เรียกทุกคน import จาก `@/lib/modules/kanban/links` ──
export {
  LINK_TYPES,
  LINK_TYPE_KINDS,
  linkTypeLabel,
  linkChipsOfCards,
  linkCountsOfCards,
  listCardLinks,
  listCardsForTarget,
  requireLinkActor,
  resolveTargets,
  targetExists,
} from "./link-resolvers";
export type { ResolvedTarget } from "./link-resolvers";

/** ความยาวสูงสุดของป้ายที่ผู้ใช้พิมพ์เอง (§K3.1) */
const LABEL_MAX = 120;
/** ความยาวสูงสุดของ URL ที่ยอมรับ (ยาวกว่านี้คือของที่ก๊อปมาผิด ไม่ใช่ลิงก์ที่คนกดจริง) */
const URL_MAX = 2000;

const ROLES: readonly KanbanLinkRole[] = ["SOURCE", "RELATED", "RESULT"];

export type AddLinkInput = {
  linkType: KanbanLinkKind;
  linkId: string;
  role?: KanbanLinkRole | null;
  label?: string | null;
};

export type CardLinkRow = {
  id: string;
  cardId: string;
  linkType: KanbanLinkKind;
  linkId: string;
  role: string | null;
  label: string | null;
  removedAt: Date | null;
};

/** ตรวจ + ปรับรูปค่าที่ผู้ใช้ส่งมา (ทุกข้อความผิดพลาดเป็นภาษาไทย — ผู้ใช้ปลายทางคือเจ้าของร้าน) */
function normalizeInput(input: AddLinkInput): { linkType: KanbanLinkKind; linkId: string; role: KanbanLinkRole | null; label: string | null } {
  const spec = LINK_TYPES[input.linkType];
  if (!spec) throw new Error("ยังไม่รองรับการเชื่อมชนิดนี้");

  const label = (input.label ?? "").trim() || null;
  if (label && label.length > LABEL_MAX) throw new Error(`ป้ายกำกับของลิงก์ยาวเกินไป (ไม่เกิน ${LABEL_MAX} ตัวอักษร)`);

  const role = input.role ?? null;
  if (role !== null && !ROLES.includes(role)) throw new Error("ความสัมพันธ์ของการเชื่อมไม่ถูกต้อง");

  const linkId = (input.linkId ?? "").trim();
  if (!linkId) throw new Error("ต้องระบุสิ่งที่จะเชื่อมกับการ์ด");
  if (input.linkType === "URL") {
    // 🔴 บังคับ http/https เท่านั้น — `javascript:` ในลิงก์ที่หน้าจอเรนเดอร์ = ช่องรันสคริปต์ให้คนกด
    if (!/^https?:\/\/\S+$/i.test(linkId)) throw new Error("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น");
    if (linkId.length > URL_MAX) throw new Error("ลิงก์ยาวเกินไป");
  } else {
    if (linkId.length > 64) throw new Error("รหัสของสิ่งที่จะเชื่อมไม่ถูกต้อง");
  }
  return { linkType: input.linkType, linkId, role, label };
}

/**
 * ผูกการ์ดกับของชิ้นหนึ่ง (EDITOR ของบอร์ด)
 * · ซ้ำ = คืนแถวเดิม (ถ้าเคยถอดไปแล้ว = คืนชีพแถวเดิม ไม่เกิดแถวที่สอง)
 * · ปลายทางต้องมีอยู่จริง **ในร้านนี้** (ตัวแปลผลกรอง `tenantId` ทุกชนิด) — ยิง id ของร้านอื่นไม่ผ่าน
 */
export async function addLink(ctx: KanbanCtx, cardId: string, input: AddLinkInput): Promise<CardLinkRow> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const v = normalizeInput(input);
  if (v.linkType !== "URL" && !(await targetExists(ctx, v.linkType, v.linkId))) {
    throw new Error(`ไม่พบ${LINK_TYPES[v.linkType].label}ที่จะเชื่อมในร้านนี้`);
  }
  return writeLink(ctx, { cardId, boardId }, v);
}

/**
 * เขียนแถวเชื่อม 1 แถว — **ไม่มีด่านสิทธิ์** (ผู้เรียกตรวจมาก่อนแล้ว)
 * ใช้ร่วมกันระหว่าง `addLink` (คนกด) กับ `createCardFromExternal` (ระบบสร้างการ์ดให้)
 */
async function writeLink(
  ctx: KanbanCtx,
  card: { cardId: string; boardId: string },
  v: { linkType: KanbanLinkKind; linkId: string; role: KanbanLinkRole | null; label: string | null },
): Promise<CardLinkRow> {
  const existing = await prisma.kanbanCardLink.findFirst({
    where: { cardId: card.cardId, linkType: v.linkType, linkId: v.linkId },
    select: { id: true, cardId: true, linkType: true, linkId: true, role: true, label: true, removedAt: true },
  });
  if (existing && existing.removedAt === null) return existing;

  if (existing) {
    // คืนชีพแถวเดิม (unique(cardId,linkType,linkId) ทำให้ "ผูกซ้ำ" ไม่มีวันเกิดแถวที่สอง)
    const revived = await prisma.$transaction(async (tx) => {
      const row = await tx.kanbanCardLink.update({
        where: { id: existing.id },
        data: { removedAt: null, role: v.role ?? existing.role, label: v.label ?? existing.label },
        select: { id: true, cardId: true, linkType: true, linkId: true, role: true, label: true, removedAt: true },
      });
      await logActivity(tx, {
        tenantId: ctx.tenantId,
        boardId: card.boardId,
        cardId: card.cardId,
        actorUserId: ctx.actorUserId ?? null,
        type: "LINK_ADDED",
        data: { linkType: v.linkType, label: v.label },
        automation: ctx.automation,
      });
      return row;
    });
    return revived;
  }

  const active = await prisma.kanbanCardLink.count({ where: { cardId: card.cardId, removedAt: null } });
  if (active >= KANBAN_LIMITS.linksPerCard) {
    // LIMIT_REACHED — เพดานอ่อนของโมดูล (limits.ts `linksPerCard`) ไม่ใช่ข้อจำกัดของ DB
    throw new Error(`การ์ดใบนี้เชื่อมข้อมูลได้สูงสุด ${KANBAN_LIMITS.linksPerCard} รายการแล้ว`);
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.kanbanCardLink.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        cardId: card.cardId,
        linkType: v.linkType,
        linkId: v.linkId,
        role: v.role,
        label: v.label,
        createdById: ctx.actorUserId ?? null,
      },
      select: { id: true, cardId: true, linkType: true, linkId: true, role: true, label: true, removedAt: true },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: card.boardId,
      cardId: card.cardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "LINK_ADDED",
      data: { linkType: v.linkType, label: v.label },
      automation: ctx.automation,
    });
    return row;
  });
}

/**
 * ถอดการเชื่อม (EDITOR) — **soft delete**: แถวยังอยู่ (`removedAt`) เพื่อให้ประวัติของการ์ดยังอ่านออก
 * และ "ผูกกลับ" คืนแถวเดิมได้ · ถอดซ้ำ = เงียบ (idempotent)
 */
export async function removeLink(ctx: KanbanCtx, cardId: string, linkRowId: string): Promise<{ removed: boolean }> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");
  const row = await prisma.kanbanCardLink.findFirst({
    where: { id: linkRowId, cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, linkType: true, label: true, removedAt: true },
  });
  if (!row) throw new Error("ไม่พบการเชื่อมนี้ในการ์ด");
  if (row.removedAt !== null) return { removed: false };
  await prisma.$transaction(async (tx) => {
    await tx.kanbanCardLink.update({ where: { id: row.id }, data: { removedAt: new Date() } });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "LINK_REMOVED",
      data: { linkType: row.linkType, label: row.label },
      automation: ctx.automation,
    });
  });
  return { removed: true };
}

/** ค้นผู้ติดต่อจากชื่อ (ป๊อปอัป "เพิ่มการเชื่อม" — ผ่าน facade ของโมดูลผู้ติดต่อเท่านั้น) */
export async function searchPartiesForLink(ctx: KanbanCtx, query: string): Promise<{ id: string; name: string }[]> {
  return searchByName(ctx.tenantId, query, 10);
}

// ───────────────────────── facade: การ์ดที่เกิดจากโมดูลอื่น ─────────────────────────

export type CreateCardFromExternalInput = {
  boardId: string;
  columnId?: string | null;
  title: string;
  description?: string | null;
  assigneeUserIds?: string[];
  dueAt?: Date | null;
  labelIds?: string[];
  sourceType: KanbanCardSourceType;
  /** กุญแจกันซ้ำ เช่น `chat:conv:{id}:{messageId}` — ยิงซ้ำกี่ครั้งก็ได้การ์ดใบเดิม */
  sourceKey: string;
  links?: AddLinkInput[];
  /**
   * K3.2 — ผู้ติดต่อของงานนี้ (ชื่อ/เบอร์/อีเมลจากต้นทาง เช่น ผู้ติดต่อในแชท)
   * ประตูนี้เป็นผู้แปลงเป็น `Party` ผ่าน facade `party.safeFindOrCreate` แล้วผูกเป็นลิงก์ `PARTY` ให้เอง
   * ⇒ โมดูลต้นทาง (แชท/ฟอร์ม/อีเมล) **ไม่ต้องรู้จักโมดูลผู้ติดต่อ** และไม่มีทางสร้าง Party ซ้ำคนละแบบ
   * 🔴 หา/สร้างไม่สำเร็จ = ข้ามไปเงียบ ๆ (การ์ดยังต้องเกิด — "ไม่เชื่อม ≠ ไม่ทำงาน")
   */
  party?: { name: string; phone?: string | null; email?: string | null } | null;
  /**
   * K3.2 — ไฟล์ที่ต้นทางมีอยู่แล้วบน CDN (ไฟล์แนบในแชท) — **ไม่อัปโหลดซ้ำ**: บันทึก `FileAsset`
   * ที่ชี้ `cdnUrl` เดิม แล้วผูกเป็น `KanbanAttachment` ของการ์ด (ไฟล์ชิ้นเดียวกัน 2 ที่ ไม่ใช่ 2 ชิ้น)
   */
  attachments?: { storageKey?: string | null; url: string; fileName?: string | null; mimeType?: string | null; sizeBytes?: number | null }[];
  /** K3.2 — เช็คลิสต์ตั้งต้น (ข้อความล้วน) — ว่าง/ไม่ส่ง = ไม่สร้างชุดเช็คลิสต์ */
  checklist?: string[];
  /** ชื่อชุดเช็คลิสต์ (ไม่ระบุ = "ขั้นตอนงาน" เหมือนที่หลังการ์ดใช้) */
  checklistTitle?: string;
};

export type CreateCardFromExternalResult = { cardId: string; created: boolean; cardNo: number | null; partyId?: string | null };

/**
 * 🔴 **ประตูเดียว** ที่โมดูลอื่น/consumer ใช้สร้างการ์ด (K3.2 แชท · K3.3 ฟอร์ม/อนุมัติ/บิล · K3.9 อีเมล)
 *
 * ทำไมต้องมีประตูเดียว: ทางเข้าเหล่านั้นทั้งหมดเป็น **event ที่ยิงซ้ำได้** (retry ของคิว · ผู้ใช้กดสองครั้ง ·
 * consumer สองตัวแข่งกัน) ⇒ ถ้าแต่ละที่เขียน `createCard` เองจะได้การ์ดซ้ำวันละหลายใบโดยไม่มีใครรู้
 * ที่นี่กันซ้ำ 2 ชั้น: อ่านก่อน (เร็ว) + `unique(tenantId, sourceKey)` ของ DB (จริง) — ชนกันเมื่อยิงพร้อมกัน
 * ก็อ่านซ้ำแล้วคืนใบเดิมด้วย `created: false` ไม่ใช่โยน error ให้ consumer ต้องเดาว่าสำเร็จหรือไม่
 *
 * ผู้เรียกไม่จำเป็นต้องมีผู้ใช้ (`ctx.actorUserId` = null ได้ — cron/consumer) ⇒ **ไม่มีด่านบทบาทบอร์ด**
 * ที่นี่ ด่านจริงของเส้นทางนี้คือ "สวิตช์เปิด/ปิดรายร้าน" ที่ฝั่งผู้เรียก (K3.2 `integrations.ts`)
 */
export async function createCardFromExternal(
  ctx: KanbanCtx,
  input: CreateCardFromExternalInput,
): Promise<CreateCardFromExternalResult> {
  const sourceKey = (input.sourceKey ?? "").trim();
  if (!sourceKey) throw new Error("การ์ดที่สร้างจากระบบอื่นต้องมี sourceKey เสมอ (กันสร้างซ้ำ)");
  const title = (input.title ?? "").trim();
  if (!title) throw new Error("ต้องมีชื่อการ์ด");

  // 🔴 ผู้เรียกที่ "เป็นคน" (ctx.actor มาแล้ว — K3.2 ปุ่มสร้างงานจากแชท) ต้องผ่านด่านบทบาทบอร์ดจริง:
  //    คนกดปุ่มเลือกบอร์ดปลายทางเองได้ ⇒ ถ้าไม่ตรวจ จะยิง boardId ของบอร์ดที่ตัวเองไม่มีสิทธิ์เขียนได้
  //    (ผู้เรียกที่เป็นระบบ/cron ไม่มี actor — ด่านของเส้นนั้นคือสวิตช์รายร้านใน `integrations.ts`)
  if (ctx.actor) await assertBoardRole(ctx, input.boardId, "EDITOR");

  const found = await findBySourceKey(ctx.tenantId, sourceKey);
  if (found) {
    const existing = await prisma.kanbanCard.findUnique({ where: { id: found }, select: { cardNo: true } });
    return { cardId: found, created: false, cardNo: existing?.cardNo ?? null };
  }

  const board = await prisma.kanbanBoard.findFirst({
    where: { id: input.boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!board) throw new Error("ไม่พบบอร์ดปลายทาง (อาจถูกเก็บเข้าคลังแล้ว) — ตั้งค่าบอร์ดใหม่ในหน้าการเชื่อมต่อ");

  const column = input.columnId
    ? await prisma.kanbanColumn.findFirst({
        where: { id: input.columnId, boardId: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
        select: { id: true },
      })
    : await prisma.kanbanColumn.findFirst({
        where: { boardId: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
        select: { id: true },
      });
  if (!column) throw new Error("บอร์ดปลายทางไม่มีคอลัมน์ที่ใช้งานอยู่");

  const description = input.description ? sanitizeDescription(input.description) : null;

  let card: { id: string; boardId: string; cardNo: number | null } | null = null;
  try {
    const created = await createCard({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      columnId: column.id,
      title: title.slice(0, 300),
      description,
      dueAt: input.dueAt ?? null,
      sourceType: input.sourceType,
      sourceKey,
      createdById: ctx.actorUserId ?? null,
    });
    card = created ? { id: created.id, boardId: created.boardId, cardNo: created.cardNo } : null;
  } catch (e) {
    // ชนกัน unique(tenantId, sourceKey) เพราะยิงพร้อมกัน (retry/consumer สองตัว) — อ่านซ้ำแล้วคืนของเดิม
    const again = await findBySourceKey(ctx.tenantId, sourceKey);
    if (again) {
      const row = await prisma.kanbanCard.findUnique({ where: { id: again }, select: { cardNo: true } });
      return { cardId: again, created: false, cardNo: row?.cardNo ?? null };
    }
    throw e;
  }
  if (!card) throw new Error("สร้างการ์ดไม่สำเร็จ — คอลัมน์ปลายทางอาจถูกเก็บเข้าคลังระหว่างทาง");

  if (input.labelIds && input.labelIds.length > 0) await setCardLabels(ctx, card.id, input.labelIds);
  if (input.assigneeUserIds && input.assigneeUserIds.length > 0) {
    await setCardAssignees(ctx, card.id, input.assigneeUserIds);
  }

  // ── ผู้ติดต่อ (K3.2) — แปลงเป็น Party ผ่าน facade แล้วต่อท้ายรายการลิงก์ที่ต้องผูก ──
  const links: AddLinkInput[] = [...(input.links ?? [])];
  let partyId: string | null = null;
  if (input.party && input.party.name.trim()) {
    partyId = await safeFindOrCreate(ctx.tenantId, {
      name: input.party.name.trim().slice(0, 200),
      phone: input.party.phone ?? null,
      email: input.party.email ?? null,
    });
    if (partyId) links.push({ linkType: "PARTY", linkId: partyId, role: "RELATED" });
  }

  for (const link of links) {
    // ปลายทางที่หาไม่เจอไม่ควรทำให้ "สร้างการ์ดจากแชทไม่ได้" — ข้ามแถวนั้นแล้วสร้างการ์ดต่อ
    const v = (() => {
      try {
        return normalizeInput(link);
      } catch {
        return null;
      }
    })();
    if (!v) continue;
    if (v.linkType !== "URL" && !(await targetExists(ctx, v.linkType, v.linkId))) continue;
    await writeLink(ctx, { cardId: card.id, boardId: card.boardId }, v);
  }

  await copyExternalAttachments(ctx, card.id, input.attachments ?? []);
  await seedChecklist(ctx, card.id, input.checklist ?? [], input.checklistTitle);

  return { cardId: card.id, created: true, cardNo: card.cardNo, partyId };
}

/**
 * คัดลอกไฟล์ที่อยู่บน CDN อยู่แล้วมาเป็นไฟล์แนบของการ์ด — **ไม่อัปโหลดใหม่**
 *
 * 🔴 ทำไมไม่ใช้ `attachments.addAttachment`: ตัวนั้นรับ "ไบต์" แล้วอัปขึ้น storage ใหม่ ⇒ ไฟล์เดียวกัน
 *    จะถูกเก็บสองก๊อป (จ่ายค่าที่เก็บสองรอบ) และการดาวน์โหลดไฟล์ลูกค้ากลับมาที่เซิร์ฟเวอร์เพื่ออัปขึ้นใหม่
 *    เป็น network call ที่ล้มได้ทุกครั้ง — ล้มแล้วจะกลายเป็น "กดสร้างงานแล้วพัง" ทั้งที่งานสำคัญกว่าคือการ์ด
 * ⇒ ที่นี่บันทึกแค่ "ทะเบียนไฟล์" ที่ชี้ `cdnUrl` เดิม · ล้มเหลว = ข้ามไฟล์นั้น ไม่พาการ์ดล้ม
 */
async function copyExternalAttachments(
  ctx: KanbanCtx,
  cardId: string,
  files: NonNullable<CreateCardFromExternalInput["attachments"]>,
): Promise<number> {
  if (files.length === 0) return 0;
  let copied = 0;
  for (const f of files.slice(0, KANBAN_LIMITS.attachmentsPerCard)) {
    const url = (f.url ?? "").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    try {
      const asset = await prisma.fileAsset.create({
        data: {
          tenantId: ctx.tenantId,
          kind: "ATTACHMENT",
          path: (f.storageKey ?? "").trim() || url,
          cdnUrl: url,
          contentType: (f.mimeType ?? "").trim() || "application/octet-stream",
          bytes: Math.max(0, Math.trunc(f.sizeBytes ?? 0)),
        },
        select: { id: true, contentType: true, bytes: true },
      });
      await prisma.kanbanAttachment.create({
        data: {
          tenantId: ctx.tenantId,
          cardId,
          fileId: asset.id,
          name: (f.fileName ?? "").trim() || "ไฟล์แนบจากแชท",
          contentType: asset.contentType,
          bytes: asset.bytes,
          uploadedById: ctx.actorUserId ?? null,
        },
      });
      copied++;
    } catch {
      // ไฟล์ชิ้นเดียวคัดลอกไม่ผ่าน ไม่ใช่เหตุให้ทั้งการ์ดหาย — ข้ามไปชิ้นถัดไป
    }
  }
  return copied;
}

/** เช็คลิสต์ตั้งต้นของการ์ดที่เกิดจากภายนอก (เขียนตรง — ผู้เรียกอาจเป็นระบบที่ไม่มีบทบาทบอร์ด) */
async function seedChecklist(ctx: KanbanCtx, cardId: string, items: string[], title?: string): Promise<void> {
  const texts = items.map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, KANBAN_LIMITS.checklistItemsPerCard);
  if (texts.length === 0) return;
  const checklist = await prisma.kanbanChecklist.create({
    data: {
      tenantId: ctx.tenantId,
      cardId,
      title: (title ?? "").trim() || "ขั้นตอนงาน",
      position: keysBetween(null, null, 1)[0]!,
    },
    select: { id: true },
  });
  const positions = keysBetween(null, null, texts.length);
  await prisma.kanbanChecklistItem.createMany({
    data: texts.map((text, i) => ({
      tenantId: ctx.tenantId,
      checklistId: checklist.id,
      text: text.slice(0, 500),
      position: positions[i]!,
    })),
  });
}

/** การ์ดที่เคยสร้างด้วยกุญแจนี้ (ขอบเขต = ร้าน ตรงกับ unique partial index ของ DB) */
async function findBySourceKey(tenantId: string, sourceKey: string): Promise<string | null> {
  const row = await prisma.kanbanCard.findFirst({ where: { tenantId, sourceKey }, select: { id: true } });
  return row?.id ?? null;
}
