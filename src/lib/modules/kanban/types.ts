// types.ts — ชนิดร่วมของโมดูล "บอร์ดงาน" (พิมพ์เขียว 13-kanban-v2 §5.1)
// ไฟล์นี้ไม่แตะ prisma และไม่ import ไฟล์อื่นในโมดูล — ทุกไฟล์ import จากที่นี่ได้โดยไม่เกิดวงกลม

import type { Role } from "@prisma/client";

/**
 * บริบทของทุก service ใหม่ในโมดูล — ต้องมี `tenantId + systemId` เสมอ (defense-in-depth:
 * ทุก `where` ผูกทั้งคู่ ไม่พึ่ง Prisma extension อย่างเดียว)
 * `actorUserId` = คนกด (ใช้บันทึก assignedById / กิจกรรม / AuditLog) — null ได้เมื่อระบบเป็นคนทำ (cron/automation)
 */
export type KanbanCtx = {
  tenantId: string;
  systemId: string;
  actorUserId?: string | null;
};

/**
 * ผู้ใช้ที่กำลังทำงาน — ประกอบจาก Membership (K1.3 จะใช้คิด `boardRole()`)
 * เก็บไว้ที่นี่ตั้งแต่ K1.2 เพราะเป็น "ชนิดร่วม" ตามสัญญา ไม่ใช่ของไฟล์ใดไฟล์หนึ่ง
 */
export type KanbanActor = {
  userId: string;
  role: Role;
  /** BusinessUnit.id ที่ผู้ใช้ดูแล ([] = ทุกสาขา สำหรับ OWNER) */
  unitAccess: string[];
  permissions: Record<string, unknown>;
};

// ───────────────────────── K1.5: DTO ของหน้าบอร์ด (ฝั่ง client อ่านอย่างเดียว) ─────────────────────────
// 🔴 ทุกฟิลด์ต้อง serialize ข้าม RSC ได้ (ไม่มี Date/Decimal/Prisma model) — วันที่เป็น ISO string
//    ประกอบที่ service.getBoardView() แล้วส่งลง <BoardView> ตรง ๆ · client ไม่รู้จัก prisma เลย

/** สีป้าย 6 สี (D9) ↔ โทเคน `--color-tag-*` */
export type KanbanTagColor = "SLATE" | "BLUE" | "GREEN" | "AMBER" | "RED" | "PURPLE";

export type BoardLabelDto = { id: string; name: string; color: KanbanTagColor };

export type BoardPersonDto = { userId: string; name: string };

export type BoardCardDto = {
  id: string;
  cardNo: number | null;
  title: string;
  position: string | null;
  /** ISO 8601 (UTC) — หน้าจอแปลงเป็นเวลาไทยเอง */
  dueAt: string | null;
  completedAt: string | null;
  labels: BoardLabelDto[];
  assignees: BoardPersonDto[];
  /** ตราท้ายการ์ด (การ์ดไม่โชว์ตราที่เป็น 0) */
  checklistDone: number;
  checklistTotal: number;
  /** K1.9: จำนวนไฟล์แนบที่ยังไม่ถูกลบ */
  attachmentCount: number;
  commentCount: number;
  /** K1.9: ปกการ์ด — URL ของไฟล์แนบที่ถูกตั้งเป็นปก (`null` = ไม่มีปก) */
  coverUrl: string | null;
  /** ที่มาของการ์ด (ชิปเล็กหัวการ์ด) — MANUAL = ไม่โชว์ชิป */
  sourceType: "MANUAL" | "TEMPLATE" | "CHAT" | "FORM" | "EMAIL" | "AUTOMATION" | "AI";
};

export type BoardColumnDto = {
  id: string;
  name: string;
  position: string | null;
  wipLimit: number | null;
  isDoneColumn: boolean;
  cards: BoardCardDto[];
};

// ───────────────────────── K1.6: หลังการ์ด — รายละเอียดที่ไม่ส่งมากับหน้าบอร์ด ─────────────────────────
// `getBoardView` (K1.5) จงใจไม่ดึง description/comment เพื่องบประมาณประสิทธิภาพ (§12.1)
// ⇒ `CardBack.tsx` เปิดแล้วค่อยขอ "ส่วนที่เหลือ" ของการ์ดเพิ่มด้วย action ตัวนี้

export type CardDetailDto = {
  id: string;
  /** HTML ที่ผ่าน sanitizeDescription แล้ว (renderDescription ทำตอนบันทึกฝั่ง client ก่อนส่งมา) */
  description: string | null;
  dueAt: string | null;
  startAt: string | null;
  reminderMinutesBefore: number | null;
  archivedAt: string | null;
  archivedById: string | null;
  status: "ACTIVE" | "ARCHIVED";
  /** K1.7: เช็คลิสต์ทั้งหมดของการ์ด (หลายชุด) — เรียงตาม position */
  checklists: KanbanChecklistDto[];
  /** K1.8: ความเห็นทั้งหมดของการ์ด (ไม่รวมที่ถูกลบ) — เรียงเก่า→ใหม่ */
  comments: KanbanCommentDto[];
  /** K1.9: ไฟล์แนบทั้งหมดของการ์ด (ไม่รวมที่ถูกลบ) — เรียงเก่า→ใหม่ */
  attachments: KanbanAttachmentDto[];
};

// ───────────────────────── K1.9: ไฟล์แนบ + ปกการ์ด ─────────────────────────

export type KanbanAttachmentDto = {
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  /** URL สาธารณะบน CDN (จาก FileAsset.cdnUrl) */
  url: string;
  /** ไฟล์นี้ถูกตั้งเป็นปกการ์ดอยู่ไหม (เทียบกับ `KanbanCard.coverFileId`) */
  isCover: boolean;
  uploadedBy: { name: string };
  createdAt: string;
};

/**
 * ผลลัพธ์ของ `addAttachment` (§K1.9) — ต่างจาก `KanbanAttachmentDto` ตรงมี `fileId`
 * (ผู้เรียกใน tx เดียวกันบางที่ต้องอ้าง `FileAsset.id` ตรง ๆ เช่นตอนตั้งเป็นปกทันทีหลังอัป)
 */
export type KanbanNewAttachmentDto = KanbanAttachmentDto & { fileId: string };

// ───────────────────────── K1.8: ความเห็น + @mention ─────────────────────────
// `body` เก็บ markup `@[ชื่อ](userId)` ตรง ๆ — ฝั่งจอแปลงเป็นชิปตอนเรนเดอร์ (ไม่ใช่ HTML ที่ server ประกอบ)

export type KanbanCommentDto = {
  id: string;
  body: string;
  author: { userId: string; name: string };
  /** userId ที่ถูกพูดถึง (กรองแล้วว่าเป็นพนักงานของร้านนี้) */
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
};

// ───────────────────────── K1.7: เช็คลิสต์ ─────────────────────────
// ทุกวันที่ serialize เป็น ISO string เสมอ (ข้าม RSC boundary / server action ได้โดยไม่มี Date ดิบ)

export type KanbanChecklistItemDto = {
  id: string;
  text: string;
  done: boolean;
  position: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  doneAt: string | null;
  doneById: string | null;
};

export type KanbanChecklistDto = {
  id: string;
  title: string;
  position: string;
  items: KanbanChecklistItemDto[];
  progress: { done: number; total: number };
};

/** แถวของหน้า "งานของฉัน" — รายการเช็คลิสต์ที่มอบหมายให้ผู้ใช้คนนั้น (เฉพาะ done=false) */
export type MyChecklistItemDto = {
  id: string;
  text: string;
  dueAt: string | null;
  done: boolean;
  card: { id: string; title: string; cardNo: number | null; boardId: string };
};

export type BoardViewDto = {
  id: string;
  systemId: string;
  name: string;
  /** บทบาทของคนที่กำลังดู (VIEWER = ซ่อนปุ่มแก้ทั้งหมด) */
  role: "VIEWER" | "EDITOR" | "ADMIN";
  /** ผู้ใช้ที่กำลังดู (K1.8) — จอใช้ตัดสินว่าแก้/ลบความเห็นใบไหนได้ + เน้นชิป @ ของตัวเอง */
  viewerUserId: string;
  visibility: "PRIVATE" | "TENANT";
  unitName: string | null;
  starred: boolean;
  columns: BoardColumnDto[];
  /** ป้ายทั้งหมดของบอร์ด (แผงป้ายใน K1.6 ใช้ต่อ) */
  labels: BoardLabelDto[];
  /** คนที่เกี่ยวข้องกับบอร์ด (สมาชิกที่ถูกเชิญ + ผู้รับผิดชอบการ์ด) — แถวรูปคนบนหัวบอร์ด */
  members: BoardPersonDto[];
  /** เวลาอ้างอิงตอนเรนเดอร์ (ISO) — ส่งมาจาก server เพื่อให้ป้ายกำหนดส่งของ server/client ตรงกันเป๊ะ */
  now: string;
};
