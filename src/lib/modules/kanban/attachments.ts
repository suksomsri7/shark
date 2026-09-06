// attachments.ts — ไฟล์แนบ + ปกการ์ด (K1.9 · พิมพ์เขียว 13-kanban-v2 §3.3 · KANBAN-RUN §K1.9)
//
// เก็บไฟล์จริงผ่าน storage กลาง (`src/lib/storage/service.ts` → `uploadFile`) — ไม่สร้างที่เก็บไฟล์ใหม่ซ้อน
// path บน storage ถูกประกอบใน `uploadFile` เอง เป็น `t/<tenantId>/attachment/<id>.<ext>` (D4/§K1.9)
//
// 🔴 `uploadFile` ตรวจแค่ "ชนิดที่ประกาศ" (`Content-Type`) กับตารางที่อนุญาต — ไม่แตะเนื้อไฟล์จริงสักไบต์
//    ⇒ ใครเปลี่ยนชื่อ `virus.exe` → `screenshot.png` แล้วประกาศ `Content-Type: image/png` ก็ผ่านฉลุย
//    ด่านของโมดูลนี้จึงเพิ่ม "ตรวจไบต์หัวไฟล์จริง" (magic bytes) เสมอ ก่อนเรียก uploadFile
//    (แพตเทิร์นเดียวกับ `account/attachment-shared.ts:sniffAttachmentMime` แต่ครอบชนิดกว้างกว่า
//    ให้ตรงกับ `ALLOWED_UPLOAD_TYPES` ของ storage ที่โมดูลนี้ใช้อยู่แล้ว — ไม่ใช่ทะเบียนที่สอง)
//
// 🔴 เขียน/ลบ/ตั้งปก = EDITOR ขึ้นไปของบอร์ด (`assertCardRole … "EDITOR"`) — มองไม่เห็นบอร์ด = 404 (§6.3)
//    ชั้นที่ 1 (คีย์สิทธิ์ `kanban.card.attach` หรือ `kanban.card.update`) ตรวจที่ actions.ts (เหมือน K1.8)
// 🔴 ลบ = soft delete (`deletedAt`) — ถ้าเป็นปกอยู่ ต้องเคลียร์ `KanbanCard.coverFileId` ในทรานแซกชันเดียวกัน
//    ไม่งั้นการ์ดจะชี้ไปยังไฟล์ที่ "หายไปแล้ว" ในสายตาโมดูลนี้ (แม้ FileAsset จริงยังไม่ถูกลบก็ตาม)

import { normalizeUploadType, uploadFile, ALLOWED_UPLOAD_TYPES, type UploadDeps } from "@/lib/storage/service";
import { KanbanNotFoundError } from "./access";
import { logActivity } from "./activity-log";
import { prisma } from "./db";
import { KANBAN_LIMITS } from "./limits";
import { assertCardRole } from "./members";
import type { KanbanAttachmentDto, KanbanCtx, KanbanNewAttachmentDto } from "./types";

export type AddAttachmentInput = {
  filename: string;
  contentType: string;
  data: Uint8Array;
};

// ─────────────────── ตรวจ "เนื้อไฟล์จริง" จากไบต์หัวไฟล์ ───────────────────
// ครอบทุกชนิดที่ `ALLOWED_UPLOAD_TYPES` (storage/service.ts) อนุญาต — ชนิดที่ไม่มีลายเซ็นตายตัว
// (`text/plain`) เชื่อชนิดที่แจ้งไว้ (เนื้อหาไม่ถูกเบราว์เซอร์รันเป็นโค้ดไม่ว่ากรณีใด)

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = "";
  for (let i = at; i < at + len && i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

/** ไบต์จริงตรงกับชนิดที่ประกาศไหม — `false` = เนื้อไฟล์ไม่ตรงกับ Content-Type ที่แจ้ง (ปฏิเสธเสมอ) */
export function bytesMatchDeclaredType(mime: string, b: Uint8Array): boolean {
  switch (mime) {
    case "application/pdf":
      return ascii(b, 0, 4) === "%PDF";
    case "image/png":
      return (
        b.length >= 8 &&
        b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
        b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
      );
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/gif":
      return ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a";
    case "image/webp":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";
    case "image/heic":
    case "image/heif": {
      if (ascii(b, 4, 4) !== "ftyp") return false;
      const brand = ascii(b, 8, 4);
      return ["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(brand);
    }
    case "application/msword":
      return b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // .docx/.xlsx เป็นไฟล์ zip ทั้งคู่ — แยกชนิดในซองไม่ได้จากลายเซ็นอย่างเดียว จึงยอมรับ zip signature
      // ใด ๆ ที่ประกาศเป็นสองชนิดนี้ (การปลอมเป็น zip ที่ไม่ใช่ office ไม่เปิดช่องโหว่เพิ่มจากที่ Bunny เสิร์ฟไฟล์
      // ตามนามสกุลอยู่แล้ว — ผู้ใช้ดาวน์โหลดได้อย่างมากก็ zip เปล่า ไม่ใช่โค้ดที่ browser รัน)
      return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
    case "text/plain":
      return true;
    case "audio/wav":
    case "audio/x-wav":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE";
    case "audio/ogg":
      return ascii(b, 0, 4) === "OggS";
    case "audio/webm":
      return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "audio/mp4":
    case "audio/x-m4a":
      return ascii(b, 4, 4) === "ftyp";
    case "audio/aac":
      return b.length >= 2 && ((b[0] === 0xff && (b[1]! & 0xf0) === 0xf0) || ascii(b, 0, 4) === "ADIF");
    case "audio/mpeg":
      return ascii(b, 0, 3) === "ID3" || (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0);
    default:
      return false;
  }
}

function extList(): string {
  return [...new Set(Object.values(ALLOWED_UPLOAD_TYPES))].join(" · ");
}

// ───────────────────────── เขียน ─────────────────────────

/**
 * แนบไฟล์ 1 ชิ้นเข้าการ์ด — EDITOR ขึ้นไปของบอร์ด
 * ลำดับด่าน: จำนวนไฟล์ต่อการ์ด (≤ `attachmentsPerCard`) → ขนาด (≤ `attachmentMaxBytes`) →
 * ชนิดอยู่ในทะเบียนที่อนุญาต → **ไบต์จริงตรงกับชนิดที่ประกาศ** → อัปขึ้น storage → บันทึกแถว
 * `deps` ฉีดได้ (ข้อสอบ) — ส่งต่อให้ `uploadFile` ตรง ๆ แทนการยิง Bunny จริง
 */
export async function addAttachment(
  ctx: KanbanCtx,
  cardId: string,
  input: AddAttachmentInput,
  deps?: UploadDeps,
): Promise<KanbanNewAttachmentDto> {
  const { boardId } = await assertCardRole(ctx, cardId, "EDITOR");

  const count = await prisma.kanbanAttachment.count({ where: { cardId, tenantId: ctx.tenantId, deletedAt: null } });
  if (count >= KANBAN_LIMITS.attachmentsPerCard) {
    throw new Error(`แนบไฟล์ได้สูงสุด ${KANBAN_LIMITS.attachmentsPerCard} ไฟล์ต่อการ์ด — ลบไฟล์เก่าก่อนจึงแนบใหม่ได้`);
  }
  if (input.data.length > KANBAN_LIMITS.attachmentMaxBytes) {
    throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(KANBAN_LIMITS.attachmentMaxBytes / (1024 * 1024))}MB — ย่อขนาดแล้วแนบใหม่ได้เลย`);
  }
  const declared = normalizeUploadType(input.contentType);
  if (!(declared in ALLOWED_UPLOAD_TYPES)) {
    throw new Error(`ชนิดไฟล์นี้แนบไม่ได้ — ชนิดที่รับตอนนี้คือ ${extList()}`);
  }
  if (!bytesMatchDeclaredType(declared, input.data)) {
    throw new Error("เนื้อไฟล์ไม่ตรงกับชนิดที่แจ้ง — ไฟล์นี้แนบไม่ได้ (ไฟล์อาจถูกเปลี่ยนนามสกุล)");
  }

  const uploaded = await uploadFile(
    { tenantId: ctx.tenantId },
    { kind: "ATTACHMENT", filename: input.filename, contentType: declared, data: input.data, maxBytes: KANBAN_LIMITS.attachmentMaxBytes },
    deps,
  );
  if (!uploaded.ok) throw new Error(uploaded.error);

  // K1.10: แถวไฟล์แนบ + ประวัติกิจกรรมอยู่ทรานแซกชันเดียวกัน (ไฟล์บน storage อัปไปแล้วก่อนหน้านี้ —
  // ตัวไฟล์ย้อนกลับไม่ได้อยู่แล้ว แต่ "แถวในฐานข้อมูล 2 ใบ" ต้องเกิด/ไม่เกิดพร้อมกันเสมอ)
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.kanbanAttachment.create({
      data: {
        tenantId: ctx.tenantId,
        cardId,
        fileId: uploaded.assetId,
        name: input.filename,
        contentType: declared,
        bytes: input.data.length,
        uploadedById: ctx.actorUserId ?? null,
      },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId,
      cardId,
      actorUserId: ctx.actorUserId ?? null,
      type: "ATTACHMENT_ADDED",
      data: { attachmentId: created.id, name: created.name, contentType: created.contentType, bytes: created.bytes },
    });
    return created;
  });

  const uploader = ctx.actorUserId
    ? await prisma.user.findUnique({ where: { id: ctx.actorUserId }, select: { name: true, email: true } })
    : null;

  return {
    id: row.id,
    fileId: row.fileId,
    name: row.name,
    contentType: row.contentType,
    bytes: row.bytes,
    url: uploaded.cdnUrl,
    isCover: false,
    uploadedBy: { name: uploader?.name ?? uploader?.email ?? "—" },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * ตั้ง/ล้างปกการ์ด — ต้องเป็นไฟล์รูปภาพเท่านั้น (`contentType` ขึ้นต้นด้วย `image/`)
 * `attachmentId: null` = เอาปกออก (ไม่แตะไฟล์แนบ — แค่เคลียร์ `coverFileId`)
 */
export async function setCover(ctx: KanbanCtx, cardId: string, attachmentId: string | null): Promise<void> {
  await assertCardRole(ctx, cardId, "EDITOR");

  if (attachmentId === null) {
    await prisma.kanbanCard.updateMany({ where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { coverFileId: null } });
    return;
  }

  const att = await prisma.kanbanAttachment.findFirst({
    where: { id: attachmentId, cardId, tenantId: ctx.tenantId, deletedAt: null },
    select: { fileId: true, contentType: true },
  });
  if (!att) throw new KanbanNotFoundError("ไม่พบไฟล์แนบนี้");
  if (!att.contentType.startsWith("image/")) {
    throw new Error("ตั้งเป็นปกได้เฉพาะไฟล์รูปภาพเท่านั้น");
  }
  await prisma.kanbanCard.updateMany({
    where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: { coverFileId: att.fileId },
  });
}

/**
 * ลบไฟล์แนบ (soft delete) — เป็นปกอยู่ → เคลียร์ `KanbanCard.coverFileId` ในทรานแซกชันเดียวกัน
 * ลบซ้ำไม่ error (ตัวที่ลบไปแล้วไม่มีอะไรให้ทำต่อ)
 */
export async function removeAttachment(ctx: KanbanCtx, attachmentId: string): Promise<void> {
  const att = await prisma.kanbanAttachment.findFirst({
    where: { id: attachmentId, tenantId: ctx.tenantId, card: { systemId: ctx.systemId } },
    select: { id: true, cardId: true, fileId: true, deletedAt: true },
  });
  if (!att) throw new KanbanNotFoundError("ไม่พบไฟล์แนบนี้");
  await assertCardRole(ctx, att.cardId, "EDITOR");
  if (att.deletedAt) return;

  await prisma.$transaction([
    prisma.kanbanAttachment.update({ where: { id: att.id }, data: { deletedAt: new Date() } }),
    prisma.kanbanCard.updateMany({
      where: { id: att.cardId, tenantId: ctx.tenantId, coverFileId: att.fileId },
      data: { coverFileId: null },
    }),
  ]);
}

// ───────────────────────── อ่าน ─────────────────────────

/** ไฟล์แนบทั้งหมดของการ์ด (ไม่รวมที่ถูกลบ) — เรียงเก่า→ใหม่ · VIEWER อ่านได้ */
export async function listAttachments(ctx: KanbanCtx, cardId: string): Promise<KanbanAttachmentDto[]> {
  await assertCardRole(ctx, cardId, "VIEWER");

  const [card, rows] = await Promise.all([
    prisma.kanbanCard.findFirst({
      where: { id: cardId, tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: { coverFileId: true },
    }),
    prisma.kanbanAttachment.findMany({
      where: { cardId, tenantId: ctx.tenantId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (rows.length === 0) return [];

  const [files, users] = await Promise.all([
    prisma.fileAsset.findMany({ where: { id: { in: rows.map((r) => r.fileId) } }, select: { id: true, cdnUrl: true } }),
    prisma.user.findMany({
      where: { id: { in: Array.from(new Set(rows.map((r) => r.uploadedById).filter((v): v is string => !!v))) } },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const urlOf = new Map(files.map((f) => [f.id, f.cdnUrl]));
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    contentType: r.contentType,
    bytes: r.bytes,
    url: urlOf.get(r.fileId) ?? "",
    isCover: card?.coverFileId === r.fileId,
    uploadedBy: { name: r.uploadedById ? (nameOf.get(r.uploadedById) ?? "—") : "—" },
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * ตัวเดียวกับที่ `Card.tsx` ต้องการบนหน้าบอร์ด — จำนวนไฟล์แนบ + URL ปก (ถ้ามี)
 * ใช้ตอนคืนการ์ดเดี่ยวจาก action (ทำสำเนา/กู้คืน) แพตเทิร์นเดียวกับ `checklistProgressOfCard` (K1.7)
 */
export async function attachmentBadgeOfCard(ctx: KanbanCtx, cardId: string): Promise<{ count: number; coverUrl: string | null }> {
  const list = await listAttachments(ctx, cardId);
  const cover = list.find((a) => a.isCover);
  return { count: list.length, coverUrl: cover?.url ?? null };
}
