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
  /**
   * K1.15/D18 — actor สำเร็จรูปสำหรับผู้เรียกที่ **ไม่ใช่คนที่ล็อกอิน** (คีย์ API)
   * ปกติ `members.loadActor(ctx)` จะไปอ่าน Membership ของ `actorUserId` เอง แต่คีย์ API ไม่มี
   * Membership (มีแต่ scope) ⇒ ชั้น REST ประกอบ actor มาให้ตรงนี้แล้วทุก service ใช้ต่อได้เหมือนเดิม
   */
  actor?: KanbanActor;
  /**
   * K2.9 — งานนี้เกิดจาก "กฎอัตโนมัติ" ใบไหน (ไม่มี = คนกดเอง)
   * ประวัติกิจกรรมที่เขียนระหว่างกฎทำงานจะได้ `data.automation = { ruleId }` ติดไปด้วย ⇒ แท็บกิจกรรม
   * แยกออกได้ว่า "ระบบทำให้" (actorUserId = null) เพราะกฎใบไหน ไม่ใช่แค่ "ไม่รู้ว่าใครทำ"
   */
  automation?: { ruleId: string };
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
  /**
   * K1.15/D18 — actor นี้คือ "คีย์ API" ไม่ใช่คน: บทบาทบน **ทุกบอร์ดของระบบที่คีย์ผูก** เท่ากับค่านี้
   * (มาจาก scope ของคีย์: `kanban.board.member.manage` → ADMIN · มี scope เขียน → EDITOR · อ่านล้วน → VIEWER)
   * คีย์ = การเชื่อมต่อระดับร้าน เหมือน automation ของเจ้าของ ⇒ ไม่มีเรื่อง "ถูกเชิญเข้าบอร์ด"
   */
  apiRole?: "ADMIN" | "EDITOR" | "VIEWER";
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
  /** K2.6: ฟิลด์กำหนดเองที่ `showOnCard=true` และการ์ดใบนี้มีค่าแล้ว (เรียงตาม sortOrder ของฟิลด์) */
  fieldsOnCard: FieldOnCardDto[];
  /** K2.7: การ์ดนี้เป็น "แม่" ของงานประจำ (มี recurrenceRule) — ชิป 🔁 บนการ์ด/แถวตาราง */
  isRecurring: boolean;
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
  /** K2.6: ค่าฟิลด์กำหนดเอง — ทุกฟิลด์ของบอร์ด (ไม่ใช่แค่ที่กรอกแล้ว) เรียงตาม sortOrder */
  customFields: CardFieldValueDto[];
  /** K2.7: กำหนดส่งซ้ำของการ์ดนี้ (null = ไม่ซ้ำ) — ตั้งได้เฉพาะการ์ดที่ไม่ใช่ลูกของงานประจำ */
  recurrenceRule: string | null;
  /** K2.7: ประโยคไทยของ `recurrenceRule` (null เมื่อไม่มีกฎ) */
  recurrenceLabel: string | null;
  /** K2.7: การ์ดนี้เป็น "ลูก" ที่เกิดจากงานประจำใบไหน (null = ไม่ใช่ลูก) */
  recurrenceParentId: string | null;
  /** K2.7: ชื่อการ์ดแม่ (มีเมื่อ `recurrenceParentId` ไม่ null) — ใช้ทำลิงก์ "เกิดจากงานประจำ: …" */
  recurrenceParentTitle: string | null;
  /** K2.9: ปุ่มอัตโนมัติของบอร์ด (kind CARD_BUTTON ที่เปิดอยู่) — VIEWER ได้ [] เพราะกดไม่ได้ */
  cardButtons: KanbanAutomationButtonDto[];
  /** K2.11: ฉันติดตามการ์ดใบนี้อยู่ไหม (ปุ่ม 👁 บนราง) */
  watching: boolean;
  /** K2.11: จำนวนผู้ติดตาม "ตรงตัว" ของการ์ดใบนี้ (ไม่นับคนที่ติดตามคอลัมน์/บอร์ด) */
  watcherCount: number;
};

/** K2.9 — ปุ่มอัตโนมัติที่โผล่บนจอ (หลังการ์ด / หัวบอร์ด) */
export type KanbanAutomationButtonDto = { id: string; name: string };

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
  /** K2.11: ฉันติดตามทั้งบอร์ดนี้อยู่ไหม (เมนู ⋯ › ติดตามบอร์ด) */
  watched: boolean;
  /** K2.11: คอลัมน์ที่ฉันติดตามอยู่ (เมนูคอลัมน์ › ติดตามคอลัมน์นี้) */
  watchedColumnIds: string[];
  columns: BoardColumnDto[];
  /** ป้ายทั้งหมดของบอร์ด (แผงป้ายใน K1.6 ใช้ต่อ) */
  labels: BoardLabelDto[];
  /** คนที่เกี่ยวข้องกับบอร์ด (สมาชิกที่ถูกเชิญ + ผู้รับผิดชอบการ์ด) — แถวรูปคนบนหัวบอร์ด */
  members: BoardPersonDto[];
  /** เวลาอ้างอิงตอนเรนเดอร์ (ISO) — ส่งมาจาก server เพื่อให้ป้ายกำหนดส่งของ server/client ตรงกันเป๊ะ */
  now: string;
  /** K2.9: ปุ่มอัตโนมัติของบอร์ด (kind BOARD_BUTTON ที่เปิดอยู่) — VIEWER ได้ [] เพราะกดไม่ได้ */
  automationButtons: KanbanAutomationButtonDto[];
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

/** งานที่ฉันติดตาม (ไม่ได้รับผิดชอบ) — K2.11 · มาจาก `watch.myWatched()` */
export type MyWatchingCardDto = {
  id: string;
  cardNo: number | null;
  title: string;
  boardId: string;
  boardName: string;
  /** คอลัมน์ที่การ์ดอยู่ตอนนี้ (บอกสถานะงานโดยไม่ต้องเปิดการ์ด) */
  columnName: string;
  /** ISO · null = ไม่กำหนดส่ง */
  dueAt: string | null;
};

export type MyTasksOverviewDto = {
  counts: MyTasksCounts;
  groups: MyTasksGroups;
  /** K1.7: รายการเช็คลิสต์ที่มอบหมายให้ฉัน (ข้ามทุกบอร์ด) — มาจาก `listMyChecklistItems` เดิม */
  checklistItems: MyChecklistItemDto[];
  /** K2.11: การ์ดที่ฉันติดตามแต่ไม่ได้รับผิดชอบ (บล็อก "ที่ฉันติดตาม") */
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

// ───────────────────────── K2.1 — มุมมองตาราง (table.ts) ─────────────────────────
// DTO บริสุทธิ์ (วันที่เป็น ISO string) — `TableView.tsx` (client) เป็นคนเรนเดอร์เท่านั้น
// 🔴 `links` ว่างเสมอจนกว่า K3.1 ("เชื่อมข้อมูล SHARK") จะเติมของจริงเข้ามา (สัญญา K2.1)
// 🔴 `TableSort`/`TableGroupBy` อยู่ในไฟล์บริสุทธิ์นี้ (ไม่ใช่ `table.ts` ที่แตะ prisma) ด้วยเหตุผลเดียวกับ
//    K1.11/K1.12/K1.13: `TableView.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิล

export type TableSort = "due" | "created" | "updated" | "position";
export type TableGroupBy = "column" | "assignee" | "label";

/** ลิงก์ไปข้อมูลของโมดูลอื่น (K3.1) — คอลัมน์ "เชื่อมระบบ" ของตาราง */
export type TableCardLinkDto = { type: string; label: string };

export type TableRowDto = {
  id: string;
  cardNo: number | null;
  title: string;
  columnId: string;
  columnName: string;
  assignees: BoardPersonDto[];
  dueAt: string | null;
  completedAt: string | null;
  checklistDone: number;
  checklistTotal: number;
  labels: BoardLabelDto[];
  links: TableCardLinkDto[];
  /** ISO 8601 (UTC) — ใช้ทั้ง sort=updated และคอลัมน์ "แก้ไขล่าสุด" ของ CSV */
  updatedAt: string;
  /** K2.6: ฟิลด์กำหนดเองที่ `showOnCard=true` และการ์ดแถวนี้มีค่าแล้ว — คู่กับ `BoardTableDto.customFieldColumns` */
  fieldsOnCard: FieldOnCardDto[];
  /** K2.7: การ์ดนี้เป็น "แม่" ของงานประจำ (มี recurrenceRule) */
  isRecurring: boolean;
};

/** กลุ่มของ `group=column|assignee|label` — `rowIds` อ้าง `TableRowDto.id` (การ์ดหลายผู้รับผิดชอบ/หลายป้าย อยู่ได้หลายกลุ่ม) */
export type TableGroupDto = { key: string; label: string; rowIds: string[] };

export type BoardTableDto = {
  rows: TableRowDto[];
  total: number;
  page: number;
  pageSize: number;
  groups?: TableGroupDto[];
  /** K2.6: ชื่อฟิลด์กำหนดเองที่ `showOnCard=true` ของบอร์ด เรียงตาม sortOrder — 1 คอลัมน์ตารางต่อชื่อ */
  customFieldColumns: string[];
};

// ───────────────────────── K2.2 — มุมมองปฏิทิน (calendar.ts) ─────────────────────────
// DTO บริสุทธิ์ (วันที่เป็น ISO string) — `CalendarView.tsx` (client) เป็นคนเรนเดอร์เท่านั้น
// 🔴 อยู่ในไฟล์นี้ (ไม่ใช่ `calendar.ts` ที่แตะ prisma) ด้วยเหตุผลเดียวกับ K1.11/K1.12/K1.13/K2.1:
//    `CalendarView.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser

/** การ์ดของบอร์ดนี้ที่ปรากฏในปฏิทิน (ทั้งในวันและถาด "ยังไม่กำหนดวัน") */
export type CalCardDto = {
  id: string;
  cardNo: number | null;
  title: string;
  /** ISO 8601 (UTC) — null = อยู่ในถาด "ยังไม่กำหนดวัน" */
  dueAt: string | null;
  columnName: string;
  labels: { name: string; color: KanbanTagColor }[];
  assignees: BoardPersonDto[];
  /** dueAt < now && ยังไม่เสร็จ (completedAt null) */
  isOverdue: boolean;
  isDone: boolean;
};

/** งานจากระบบอื่น (อ่านอย่างเดียว) — มาจาก `src/lib/modules/calendar/service.ts` (`getCalendarEvents`) */
export type CalExternalDto = {
  id: string;
  kind: string;
  title: string;
  startAt: string;
  endAt: string;
  /** หน้าต้นทาง — `/app/calendar?d=YYYY-MM-DD` (คลิกแล้วไปหน้านั้น ไม่เปิดหลังการ์ด) */
  href: string;
};

export type CalDayDto = { cards: CalCardDto[]; external: CalExternalDto[] };

export type BoardCalendarDto = {
  range: { from: string; to: string };
  /** คีย์ = วันที่ไทย "YYYY-MM-DD" — วันที่ไม่มีการ์ด/งานเลยจะไม่มีคีย์นี้ในอ็อบเจกต์ (client เติมช่องว่างเอง) */
  days: Record<string, CalDayDto>;
  /** การ์ด active ที่ไม่มี dueAt (ผ่านตัวกรองเดียวกับวันในปฏิทิน) */
  unscheduled: CalCardDto[];
};

// ───────────────────────── K2.3 — มุมมองไทม์ไลน์ (timeline.ts) ─────────────────────────
// DTO บริสุทธิ์ (วันที่เป็น ISO string) — `TimelineView.tsx` (client) เป็นคนเรนเดอร์เท่านั้น
// 🔴 อยู่ในไฟล์นี้ (ไม่ใช่ `timeline.ts` ที่แตะ prisma) ด้วยเหตุผลเดียวกับ K1.11/K1.12/K1.13/K2.1/K2.2:
//    `TimelineView.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser
//    `TableGroupBy` (K2.1) มีค่าเดียวกันเป๊ะ ("column"|"assignee"|"label") แต่ตั้งชื่อแยกเป็นของตัวเองที่นี่
//    ตามธรรมเนียมที่ทุกมุมมองเป็นเจ้าของ enum การจัดกลุ่ม/เรียงของตัวเอง (K2.1 ก็แยกจาก K2.4 เหมือนกัน)
export type TimelineGroupBy = "column" | "assignee" | "label";

/** แถบงาน 1 ใบในไทม์ไลน์ — 1 การ์ดอาจปรากฏหลายแถบถ้า group=assignee/label แล้วมีหลายคน/หลายป้าย */
export type TimelineBarDto = {
  cardId: string;
  cardNo: number | null;
  title: string;
  /** ISO 8601 (UTC) — null = การ์ดไม่มีวันเริ่ม (แถบยาว 1 วัน ดู `startDay`/`endDay`) */
  startAt: string | null;
  /** ISO 8601 (UTC) — ทุกแถบมี dueAt เสมอ (แถบคัดจากการ์ดที่มี dueAt ในช่วงที่ขอเท่านั้น) */
  dueAt: string;
  /** "YYYY-MM-DD" ตามวันที่ไทย — วันจริง **ไม่ถูกตัดตามช่วงที่แสดง** (จอเป็นคนตัดแสดงจาก `range.from` เอง) */
  startDay: string;
  endDay: string;
  isOverdue: boolean;
  isDone: boolean;
  /** สีป้ายแรกของการ์ด (เรียงตาม sortOrder ของป้ายเหมือน `KanbanCard.labels` json) — ไม่มีป้าย = null */
  color: KanbanTagColor | null;
  columnName: string;
  assignees: BoardPersonDto[];
};

/** แถวหนึ่งของไทม์ไลน์ — `key` คือ columnId/userId/labelId แล้วแต่ `group` ("none" = ไม่มีผู้รับผิดชอบ/ป้าย) */
export type TimelineRowDto = { key: string; label: string; bars: TimelineBarDto[] };

export type BoardTimelineDto = {
  range: { from: string; to: string };
  /** จำนวนวันของช่วงที่ขอ (`to`-`from`) — จอใช้คำนวณความกว้างคอลัมน์วัน (ซูมต่างกัน = ความกว้างต่างกัน) */
  zoomDays: number;
  rows: TimelineRowDto[];
  /** การ์ด active ไม่มี dueAt (ผ่านตัวกรองเดียวกับแถบ) — แถวท้าย "ยังไม่กำหนดวัน" ชวนไปมุมมองปฏิทิน */
  unscheduled: number;
};

// ───────────────────────── K2.4 — มุมมองสรุป (summary.ts) ─────────────────────────
// DTO บริสุทธิ์ (ไม่มี Date/Prisma model) — `SummaryView.tsx` (client) เป็นคนเรนเดอร์เท่านั้น
// 🔴 `href` ของทุกไทล์ชี้ไป `?view=table&...` พร้อมตัวกรองที่กดจริง — เจาะลงแล้วต้องได้จำนวนเท่ากับ `count`
//    เป๊ะ (สัญญา ledger/KANBAN-RUN.md §K2.4 · ข้อสอบ S1.5) — ห้ามเปลี่ยนวิธีนับที่ `summary.ts` โดยไม่เปลี่ยน
//    `href`/`listBoardTable` (K2.1) คู่กัน
// 🔴 อยู่ในไฟล์บริสุทธิ์นี้ (ไม่ใช่ `summary.ts` ที่แตะ prisma) ด้วยเหตุผลเดียวกับ K1.11/K1.12/K1.13/K2.1/K2.2:
//    `SummaryView.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser

/** ไทล์ 1 แถวของแต่ละมิติ (คอลัมน์/คน/กำหนดส่ง/ป้าย) — `href` พาไปตารางที่กรองแล้ว (`?view=table&...`) */
export type SummaryTileDto = { key: string; label: string; count: number; href: string };

/** ไทล์ของมิติ "ป้ายกำกับ" — มีสีเพิ่มจาก `SummaryTileDto` (จุดสีหน้าชื่อป้าย) */
export type SummaryLabelTileDto = SummaryTileDto & { color: KanbanTagColor };

export type SummaryThroughputWeekDto = { weekStart: string; created: number; completed: number };

export type BoardSummaryDto = {
  totals: { open: number; overdue: number; dueToday: number; dueWeek: number; done: number };
  byColumn: SummaryTileDto[];
  byAssignee: SummaryTileDto[];
  byDue: SummaryTileDto[];
  byLabel: SummaryLabelTileDto[];
  /** 8 สัปดาห์ล่าสุด (จันทร์ไทยของแต่ละสัปดาห์) — สัปดาห์นี้อยู่ท้ายสุด */
  throughput: SummaryThroughputWeekDto[];
};

// ───────────────────────── K2.5 — มุมมองที่บันทึกไว้ (views.ts) ─────────────────────────
// DTO บริสุทธิ์ (ไม่มี Date/Prisma model) — `SavedViewsMenu.tsx`/`SavedViewsSettings.tsx` (client) ต้อง
// `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser ด้วยเหตุผลเดียวกับ K1.11/K1.12/K1.13/
// K2.1/K2.2/K2.4 — `views.ts` (server-only: validate ด้วย zod + แตะ prisma) `export type { ... } from "./types"`
// ให้ผู้เรียกยัง `import type { ViewConfig } from "@/lib/modules/kanban/views"` ได้เหมือนเดิม

/** `BOARD` = ของทั้งทีม (`ownerUserId` = null · ADMIN เท่านั้นที่สร้าง/แก้/ลบ) · `PRIVATE` = ของคนคนเดียว */
export type ViewScope = "PRIVATE" | "BOARD";

/** ตรงกับ `BoardFilters` (filters.ts) แต่ประกาศแยกที่นี่ — `views.ts` ตรวจรูปด้วย zod ก่อนเชื่อค่าที่เก็บใน DB */
export type ViewFilters = {
  assignee?: string;
  label?: string;
  due?: "overdue" | "today" | "week" | "none";
  status?: "done" | "open";
  q?: string;
  column?: string;
};

/** โครง config ที่เก็บใน `KanbanBoardView.config` (§2.3) — `view` ไม่รู้จัก/รูปผิด → `views.ts` throw ไทยตอนบันทึก */
export type ViewConfig = {
  view: "board" | "table" | "calendar" | "summary" | "timeline";
  filters?: ViewFilters;
  sort?: string;
  group?: string;
  /** K2.3: ระดับซูมของมุมมองไทม์ไลน์ ("week"|"month"|"quarter") — เก็บเป็น string กว้าง ๆ เหมือน sort/group เดิม */
  zoom?: string;
};

export type SavedViewDto = {
  id: string;
  /** null = มุมมองข้ามบอร์ด (K3.8 — ยังไม่มีโค้ดสร้างแถวนี้ใน K2.5) */
  boardId: string | null;
  /** null = scope BOARD (ทั้งทีม) */
  ownerUserId: string | null;
  name: string;
  scope: ViewScope;
  config: ViewConfig;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// ───────────────────────── K2.6 — ฟิลด์กำหนดเอง (fields.ts) ─────────────────────────
// DTO บริสุทธิ์ (ไม่มี Date/Prisma model/Decimal) — `CustomFields.tsx`/`CustomFieldsSettings.tsx`/
// `Card.tsx`/`TableView.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser
// ด้วยเหตุผลเดียวกับ K1.11/…/K2.5 — `fields.ts` (server-only: แตะ prisma) `export type { ... } from "./types"`
// ให้ผู้เรียกยัง `import type { CustomFieldDto } from "@/lib/modules/kanban/fields"` ได้เหมือนเดิม

/** ตรงกับ enum `KanbanCustomFieldType` ใน Prisma — เขียนซ้ำที่นี่ให้ฝั่ง client ไม่ต้องรู้จัก prisma */
export type KanbanCustomFieldType = "TEXT" | "NUMBER" | "DATE" | "CHECKBOX" | "SELECT";

/** `NUMBER`: หน่วย + ทศนิยม (ไม่ระบุ = เดาจากค่า) · `SELECT`: รายการตัวเลือก · `TEXT`/`DATE`/`CHECKBOX`: ว่าง */
export type CustomFieldOptions = { unit?: string; decimals?: number; choices?: string[] };

/** นิยามฟิลด์ 1 ตัวของบอร์ด (ตั้งค่าบอร์ด › ฟิลด์กำหนดเอง) */
export type CustomFieldDto = {
  id: string;
  boardId: string;
  name: string;
  type: KanbanCustomFieldType;
  options: CustomFieldOptions;
  showOnCard: boolean;
  sortOrder: number;
};

/** ค่าฟิลด์ 1 ตัวของการ์ดใบเดียว (หลังการ์ด) — `value` เป็นชนิด JS ดิบ (number/string/boolean/ISO string/null)
 * `display` คือข้อความไทยพร้อมใช้ (คั่นหลักพัน/วันที่ พ.ศ./✓ หรือ —) — คำนวณที่ server เสมอ ไม่คำนวณซ้ำฝั่งจอ */
export type CardFieldValueDto = {
  fieldId: string;
  name: string;
  type: KanbanCustomFieldType;
  options: CustomFieldOptions;
  showOnCard: boolean;
  sortOrder: number;
  value: string | number | boolean | null;
  display: string;
};

/** ชิปฟิลด์บนตัวการ์ด/แถวตาราง — เฉพาะฟิลด์ `showOnCard=true` ที่การ์ดมีค่าแล้ว */
export type FieldOnCardDto = { name: string; display: string };

// ───────────────────────── K2.7 — เทมเพลตการ์ด + กำหนดส่งซ้ำ ─────────────────────────
// DTO บริสุทธิ์ (ไม่มี Date/Prisma model) — `CardTemplatePicker.tsx`/`CardTemplatesSettings.tsx` (client)
// ต้อง `import type` ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser ด้วยเหตุผลเดียวกับ K1.11/…/K2.6

/** เทมเพลตการ์ด 1 ใบของบอร์ด (ตั้งค่าบอร์ด › "เทมเพลตการ์ด" + เมนู "จากเทมเพลต ▾" ในคอลัมน์) */
export type CardTemplateDto = {
  id: string;
  name: string;
  title: string;
  /** จำนวนป้ายที่ยังมีอยู่จริง (ป้ายที่ถูกลบไปแล้วนับไม่รวม) */
  labelCount: number;
  /** ผลรวมจำนวนรายการเช็คลิสต์ทุกชุดในเทมเพลตนี้ */
  checklistItemCount: number;
  sortOrder: number;
};

// ───────────────────────── K2.8 — กล่องงานเข้าส่วนตัว (inbox.ts) ─────────────────────────
// DTO บริสุทธิ์ (ไม่มี Date/Prisma model) — `InboxPanel.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก
// `db.ts` → `pg` เข้าบันเดิลฝั่ง browser ด้วยเหตุผลเดียวกับ K1.11/…/K2.7

/** ที่มาของรายการกล่องงานเข้า — ตรงกับ `KanbanInboxItem.source` (เก็บเป็น String ไม่ใช่ enum ใน DB) */
export type KanbanInboxSource = "MANUAL" | "CHAT" | "EMAIL" | "FORM" | "AI";

/** รายการ 1 ใบในกล่องงานเข้า (ปกติเห็นเฉพาะ status OPEN — เห็นเฉพาะเจ้าของ) */
export type InboxItemDto = {
  id: string;
  ownerUserId: string;
  title: string;
  /** สรุปจาก AI / เนื้อหาจากต้นทาง — มีค่า = โชว์ป้าย "AI ตั้งชื่อ + สรุปให้แล้ว" */
  note: string | null;
  source: KanbanInboxSource;
  /** ป้ายไทยพร้อมโชว์ — "จดไว้เอง" / "จากแชท" / "ส่งต่อทางอีเมล" / "จากฟอร์ม" / "ผู้ช่วย AI" */
  sourceLabel: string;
  fileIds: string[];
  status: "OPEN" | "MOVED" | "DISMISSED";
  movedCardId: string | null;
  /** ISO 8601 (UTC) — หน้าจอแปลงเป็นเวลาไทยเอง */
  createdAt: string;
};

// ───────────────────────── K2.10 — รายงาน (reports.ts) ─────────────────────────
// DTO บริสุทธิ์ (ไม่มี Date/Prisma model) — `ReportsPage.tsx` (client) ต้อง `import type` ได้โดยไม่ลาก
// `db.ts` → `pg` เข้าบันเดิลฝั่ง browser ด้วยเหตุผลเดียวกับ K1.11/K1.12/K1.13/K2.1/K2.2/K2.4/K2.5

/** ตัวเลขค้างของบอร์ดเดียว — `dueToday`/`dueWeek` คำนวณจากปฏิทินไทย (จ.–อา.) ของ `now` ที่ส่งเข้า `openCards` */
export type ReportOpenBoardDto = { boardId: string; boardName: string; open: number; overdue: number; dueToday: number; dueWeek: number };

export type ReportOpenCardsDto = { total: number; overdue: number; byBoard: ReportOpenBoardDto[] };

export type ReportOverdueRowDto = {
  cardId: string;
  cardNo: number | null;
  title: string;
  boardId: string;
  boardName: string;
  columnName: string;
  /** ISO 8601 (UTC) */
  dueAt: string;
  /** จำนวนวันไทยเต็มที่เลยมาแล้ว (≥ 0) */
  daysOverdue: number;
  assignees: BoardPersonDto[];
};

/** เรียงเลยกำหนดนานสุดก่อน · `take: 500` (§12.1) */
export type ReportOverdueDto = { total: number; rows: ReportOverdueRowDto[] };

export type ReportWorkloadRowDto = { userId: string; name: string; open: number; overdue: number; dueWeek: number; done30d: number };

/** เรียง `open` มากก่อน — `userId: "none"` = ยังไม่มอบหมาย */
export type ReportWorkloadDto = { rows: ReportWorkloadRowDto[] };

export type ReportThroughputWeekDto = { weekStart: string; created: number; completed: number };

export type ReportAgingBucketKey = "0-7" | "8-14" | "15-30" | "31+";
export type ReportAgingBucketDto = { key: ReportAgingBucketKey; label: string; count: number };
export type ReportAgingColumnDto = { boardId: string; boardName: string; columnName: string; open: number; avgDays: number; maxDays: number };

/** `byColumn` เรียง `avgDays` มากก่อน */
export type ReportAgingDto = { buckets: ReportAgingBucketDto[]; byColumn: ReportAgingColumnDto[] };

export type ReportKind = "overdue" | "workload" | "throughput" | "aging";
