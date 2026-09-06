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

// ───────────────────────── K1.10: ประวัติกิจกรรม + สายรวม ─────────────────────────
// 🔴 DTO ชุดนี้ต้อง serialize ข้าม RSC/server action ได้ (ไม่มี Date/Prisma model) — วันที่เป็น ISO string
// 🔴 `data` เก็บ **id** (คอลัมน์/ป้าย/คน) ส่วน `names` คือชื่อที่ service resolve มาให้แล้วแบบ batch
//    ⇒ จอเรนเดอร์ประโยคไทยได้ทันทีโดยไม่ยิงคำขอเพิ่มรายแถว (กัน N+1 ที่หน้าจอ)

/** ชนิดกิจกรรม — ตรงกับ enum `KanbanActivityType` ใน Prisma (เขียนซ้ำที่นี่ให้ฝั่ง client ไม่ต้องรู้จัก prisma) */
export type KanbanActivityKind =
  | "BOARD_CREATED"
  | "BOARD_UPDATED"
  | "BOARD_ARCHIVED"
  | "MEMBER_ADDED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_REMOVED"
  | "COLUMN_CREATED"
  | "COLUMN_UPDATED"
  | "COLUMN_MOVED"
  | "COLUMN_ARCHIVED"
  | "CARD_CREATED"
  | "CARD_UPDATED"
  | "CARD_MOVED"
  | "CARD_ASSIGNED"
  | "CARD_UNASSIGNED"
  | "CARD_DUE_SET"
  | "CARD_LABELED"
  | "CARD_UNLABELED"
  | "CARD_ARCHIVED"
  | "CARD_RESTORED"
  | "CARD_COMPLETED"
  | "CHECKLIST_ITEM_DONE"
  | "COMMENT_ADDED"
  | "ATTACHMENT_ADDED";

/** ชื่อที่ resolve มาแล้วสำหรับเรนเดอร์ประโยคไทย (ไม่มี = อ้างของที่ถูกลบไปแล้ว → ประโยคจะเลี่ยงชื่อเอง) */
export type KanbanActivityNames = {
  fromColumn?: string;
  toColumn?: string;
  column?: string;
  users?: string[];
  labels?: string[];
  card?: string;
};

export type KanbanActivityDto = {
  id: string;
  type: KanbanActivityKind;
  boardId: string;
  /** null = กิจกรรมระดับบอร์ด (คอลัมน์/สมาชิก/บอร์ดเอง) */
  cardId: string | null;
  /** null = ระบบเป็นคนทำ (cron/automation/นำเข้า) */
  actor: { userId: string; name: string } | null;
  data: Record<string, unknown>;
  names: KanbanActivityNames;
  createdAt: string;
};

/** 1 แถวของ "สายรวม" ในหลังการ์ด — ความเห็น 1 ใบ หรือกิจกรรม 1 รายการ (เรียงล่าสุดก่อนเสมอ) */
export type KanbanTimelineItemDto =
  | { kind: "comment"; id: string; createdAt: string; comment: KanbanCommentDto }
  | { kind: "activity"; id: string; createdAt: string; activity: KanbanActivityDto };

/** ตัวกรองแท็บของสายรวม (ทั้งหมด / ความเห็น / กิจกรรม) */
export type KanbanTimelineFilter = "all" | "comments" | "activity";

/** ผลลัพธ์แบบแบ่งหน้าของทุกฟังก์ชันอ่านใน `activity.ts` — `nextCursor` = null คือหมดแล้ว */
export type KanbanPage<T> = { items: T[]; nextCursor: string | null };

// ───────────────────────── K1.12: เทมเพลตบอร์ด + หน้ารวมบอร์ดใหม่ ─────────────────────────
// 🔴 ชนิดของ DTO เหล่านี้อยู่ในไฟล์ **บริสุทธิ์** นี้ (ไม่ใช่ใน `templates.ts`/`boardsHome.ts` ที่แตะ prisma)
//    โดยตั้งใจ — client component (`BoardsHome.tsx`/`TemplatePicker.tsx`/`CreateBoardModal.tsx`)ต้อง
//    `import type` DTO พวกนี้ได้โดยไม่ลาก `db.ts`→`pg` เข้าบันเดิลฝั่ง browser (บทเรียนเดียวกับ K1.11
//    deviation #1 — Turbopack เดินตามทั้งไฟล์ตอนสร้าง client chunk แม้จะ import แค่ type ก็ตาม)

/** สี/ธงคอลัมน์ + ป้าย + การ์ดของโครงเทมเพลต (โครง JSON ที่เก็บใน `KanbanBoardTemplate.structure`) */
export type TemplateColumnSpec = {
  name: string;
  isDone?: boolean;
  wipLimit?: number | null;
  color?: KanbanTagColor;
};

export type TemplateLabelSpec = { name: string; color: KanbanTagColor };

export type TemplateCardSpec = {
  title: string;
  /** ชื่อคอลัมน์ (ต้องตรงกับชื่อใน `columns` ของ structure เดียวกัน) */
  column: string;
  description?: string;
  /** ชื่อป้าย (ต้องอยู่ใน `labels` ของ structure เดียวกัน) */
  labels?: string[];
  /** รายการเช็คลิสต์ 1 ชุด (ไม่มี = การ์ดนี้ไม่มีเช็คลิสต์) */
  checklist?: string[];
};

export type TemplateStructure = {
  columns: TemplateColumnSpec[];
  labels: TemplateLabelSpec[];
  cards: TemplateCardSpec[];
};

export type BoardTemplateDto = {
  id: string;
  tenantId: string | null;
  scope: "PLATFORM" | "TENANT";
  key: string | null;
  name: string;
  description: string | null;
  icon: string;
  structure: TemplateStructure;
  createdById: string | null;
  createdAt: string;
};

/** การ์ดบอร์ด 1 ใบในหน้ารวมบอร์ด (ย่อกว่า `BoardCardDto` — แค่พอสรุปเป็นการ์ดบนหน้ารวม) */
export type BoardsHomeCardDto = {
  id: string;
  name: string;
  color: KanbanTagColor;
  unitId: string | null;
  visibility: "PRIVATE" | "TENANT";
  cardCount: number;
  overdueCount: number;
  members: { userId: string; name: string }[];
  updatedAt: string;
};

export type BoardsHomeDto = {
  starred: BoardsHomeCardDto[];
  byUnit: { unit: { id: string; name: string }; boards: BoardsHomeCardDto[] }[];
  tenantWide: BoardsHomeCardDto[];
  templates: BoardTemplateDto[];
  totals: { boards: number; openCards: number };
};

// ───────────────────────── K1.13: งานของฉันใหม่ + มือถือ (my-tasks.ts) ─────────────────────────
// 🔴 ชนิดของ DTO อยู่ในไฟล์บริสุทธิ์นี้ (ไม่ใช่ `my-tasks.ts` ที่แตะ prisma) ด้วยเหตุผลเดียวกับ K1.11/K1.12:
//    `MyTasks.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser

/** การ์ด 1 ใบในหน้า "งานของฉัน" — ย่อกว่า `BoardCardDto`/`SearchCardDto` (พอสำหรับรายการ ไม่ใช่หน้าบอร์ด) */
export type MyTaskCardDto = {
  id: string;
  cardNo: number | null;
  title: string;
  boardId: string;
  boardName: string;
  columnName: string;
  /** ISO 8601 (UTC) — หน้าจอแปลงเป็นเวลาไทยเอง */
  dueAt: string | null;
  labels: BoardLabelDto[];
  /** มีเฉพาะการ์ดที่มีเช็คลิสต์อย่างน้อย 1 ชุด (ไม่มี = ไม่โชว์ตราความคืบหน้า) */
  checklistProgress?: { done: number; total: number };
};

export type MyTasksCounts = {
  overdue: number;
  today: number;
  week: number;
  none: number;
  /** ปิดไปสัปดาห์นี้ — completedAt อยู่ในสัปดาห์ปัจจุบัน (จันทร์–อาทิตย์ เวลาไทย) */
  doneThisWeek: number;
};

export type MyTasksGroups = {
  overdue: MyTaskCardDto[];
  today: MyTaskCardDto[];
  week: MyTaskCardDto[];
  /** เลยสัปดาห์นี้ไปแล้ว (มีกำหนดส่งแต่ไกลกว่า "สัปดาห์นี้") — ไม่มีตัวนับคู่กันใน `counts` ตามสัญญา */
  later: MyTaskCardDto[];
  /** ไม่มีกำหนดส่งเลย */
  none: MyTaskCardDto[];
};

/** งานที่ฉันติดตาม (ไม่ได้รับผิดชอบ) — ฟีเจอร์ "ติดตาม" ยังไม่มีจนกว่าจะถึง K2.11 → คืน `[]` เสมอไปก่อน */
export type MyWatchingCardDto = { id: string; cardNo: number | null; title: string; boardId: string; boardName: string };

export type MyTasksOverviewDto = {
  counts: MyTasksCounts;
  groups: MyTasksGroups;
  /** K1.7: รายการเช็คลิสต์ที่มอบหมายให้ฉัน (ข้ามทุกบอร์ด) — มาจาก `listMyChecklistItems` เดิม */
  checklistItems: MyChecklistItemDto[];
  /** K2.11 ยังไม่ทำฟีเจอร์ "ติดตามการ์ด" — คงไว้ `[]` เสมอ (ดูหมายเหตุที่ `my-tasks.ts`) */
  watching: MyWatchingCardDto[];
};

// ───────────────────────── K1.14 — คลังเก็บ (archive.ts) ─────────────────────────
// DTO บริสุทธิ์: วันที่เป็น ISO string ไม่ใช่ `Date` — หน้าคลังเป็น client component
// (ส่ง `Date` ข้ามเส้น server→client ได้ก็จริง แต่จะโดน serialize เป็นสตริงอยู่ดี แล้วชนิดที่ประกาศจะโกหก)

export type ArchivedCardDto = {
  id: string;
  cardNo: number | null;
  title: string;
  /** ISO · null = แถวเก่าที่ถูกเก็บก่อนมีคอลัมน์ `archivedAt` */
  archivedAt: string | null;
  archivedBy: { userId: string; name: string } | null;
  columnName: string | null;
};

export type ArchivedColumnDto = {
  id: string;
  name: string;
  archivedAt: string | null;
  /** จำนวนการ์ดที่ยังผูกกับคอลัมน์นี้ (กลับมาพร้อมกันตอนกู้คืน) */
  cardCount: number;
};

export type ArchiveListDto = {
  cards: ArchivedCardDto[];
  columns: ArchivedColumnDto[];
};
