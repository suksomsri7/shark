// serialize.ts — แถวของ Prisma/DTO ภายใน → JSON ที่ผู้เชื่อมต่อภายนอกเห็น (K1.15)
//
// 🔴 กติกา 3 ข้อ (ทุก op ต้องผ่านที่นี่ ห้ามคืนแถวดิบ):
//   1. ไม่มี `Date` หลุดออกไป — เวลาเป็น ISO-8601 (UTC) เสมอ · null คงเป็น null
//   2. ไม่มี `tenantId`/`systemId` ในคำตอบ (คีย์รู้อยู่แล้วว่าตัวเองอยู่ร้าน/ระบบไหน · ลดข้อมูลรั่ว)
//   3. รูปร่างของแถวเปลี่ยนได้ยาก = สัญญาของ API ⇒ เพิ่มฟิลด์ได้ ลบ/เปลี่ยนความหมายไม่ได้

import type {
  KanbanBoard,
  KanbanBoardRole,
  KanbanCard,
  KanbanColumn,
  KanbanEntityStatus,
} from "@prisma/client";

/** `Date | null` → ISO string | null (ไม่มี `undefined` ในคำตอบ — ผู้เรียกจะได้ไม่ต้องเดา) */
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export type ApiBoardRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  unitId: string | null;
  visibility: "PRIVATE" | "TENANT";
  status: KanbanEntityStatus;
  cardCount: number;
  starred: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type BoardRowInput = KanbanBoard & { starred?: boolean; _count?: { cards: number } };

/** แถวบอร์ดในรายการ (`boards.list`) — `cardCount` = การ์ด ACTIVE ของบอร์ดนั้น */
export function boardRow(b: BoardRowInput, opts: { cardCount?: number; starred?: boolean } = {}): ApiBoardRow {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    color: b.color,
    unitId: b.unitId,
    visibility: b.visibility,
    status: b.status,
    cardCount: opts.cardCount ?? b._count?.cards ?? 0,
    starred: opts.starred ?? b.starred ?? false,
    createdAt: iso(b.createdAt),
    updatedAt: iso(b.updatedAt),
  };
}

export type ApiCardRow = {
  id: string;
  cardNo: number | null;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  status: KanbanEntityStatus;
  position: string | null;
  sortOrder: number;
  assigneeUserId: string | null;
  labels: string[];
  dueAt: string | null;
  startAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** ป้ายในคอลัมน์ Json เดิม (`labels`) — เก็บเป็นชื่อป้ายล้วน ๆ */
function labelNames(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function cardRow(c: KanbanCard): ApiCardRow {
  return {
    id: c.id,
    cardNo: c.cardNo,
    boardId: c.boardId,
    columnId: c.columnId,
    title: c.title,
    description: c.description,
    status: c.status,
    position: c.position,
    sortOrder: c.sortOrder,
    assigneeUserId: c.assigneeUserId,
    labels: labelNames(c.labels),
    dueAt: iso(c.dueAt),
    startAt: iso(c.startAt),
    completedAt: iso(c.completedAt),
    archivedAt: iso(c.archivedAt),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export type ApiColumnRow = {
  id: string;
  boardId: string;
  name: string;
  position: string | null;
  sortOrder: number;
  status: KanbanEntityStatus;
  wipLimit: number | null;
  isDoneColumn: boolean;
  color: string | null;
  createdAt: string | null;
};

export function columnRow(c: KanbanColumn): ApiColumnRow {
  return {
    id: c.id,
    boardId: c.boardId,
    name: c.name,
    position: c.position,
    sortOrder: c.sortOrder,
    status: c.status,
    wipLimit: c.wipLimit,
    isDoneColumn: c.isDoneColumn,
    color: c.color,
    createdAt: iso(c.createdAt),
  };
}

export type ApiMemberRow = {
  userId: string;
  name: string;
  email: string;
  role: KanbanBoardRole;
  tenantRole: string;
};

export function memberRow(m: ApiMemberRow): ApiMemberRow {
  return { userId: m.userId, name: m.name, email: m.email, role: m.role, tenantRole: m.tenantRole };
}
