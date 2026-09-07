// filters.ts — ส่วน "บริสุทธิ์" ของตัวกรอง/ค้นหา (K1.11) แยกออกจาก `search.ts` โดยตั้งใจ
//
// 🔴 ทำไมต้องแยกไฟล์: `search.ts` มี `searchCards` ที่ต้อง `import { prisma } from "./db"`
//    (`@/lib/core/db.ts` ทำ `new PrismaClient()` ตอนโหลดโมดูล) — ตอน build production เจอว่า
//    Next.js/Turbopack **ลากทั้งไฟล์ `search.ts` เข้าบันเดิลฝั่ง browser** ทันทีที่ client component
//    (`BoardView.tsx`/`FilterBar.tsx`) import ชื่อใดก็ได้จากไฟล์เดียวกัน แม้จะ `await import("./db")`
//    แบบ dynamic ในฟังก์ชันที่ฝั่ง client ไม่เคยเรียกก็ตาม (Turbopack ยัง trace edge นี้ตอนสร้าง
//    module graph ของ client chunk แล้ว build ล้มเพราะ `pg`/`@prisma/adapter-pg` ไม่มีให้ใช้ในเบราว์เซอร์
//    — ดู error จริงตอน build: "Import trace: … db.ts → search.ts → BoardView.tsx [Client Component Browser]")
//    ⇒ ไฟล์นี้จึงต้อง **ไม่มี import ใด ๆ ที่แตะ prisma/`./db`/`./access` เด็ดขาด ทั้ง static และ dynamic**
//    `BoardView.tsx`/`FilterBar.tsx`/`SearchPalette.tsx` (client) import จากไฟล์นี้โดยตรง
//    `search.ts` (server-only: `searchCards` + `actions.ts`) re-export ทุกอย่างจากที่นี่ให้ oracle
//    เรียกผ่าน `@/lib/modules/kanban/search` ได้ครบตามสัญญา (parseSearchQuery/filterBoardCards/searchCards
//    ทั้งสามตัวอยู่ในโมดูลเดียวกันจากมุมมองผู้เรียก แม้ไฟล์จริงจะแยกกันสองไฟล์)

// ───────────────────────── ตัวกรอง (ร่วมทุกฟังก์ชัน) ─────────────────────────

export type DueBucket = "overdue" | "today" | "week" | "none";
export type CardStatus = "done" | "open";

/**
 * รูปตัวกรองร่วม — ตรงกับพารามิเตอร์ URL ที่สัญญาปักไว้:
 * `?assignee=me|<userId>&label=<ชื่อป้าย>&due=overdue|today|week|none&status=done|open&q=`
 * `board` ใช้เฉพาะ `searchCards` ข้ามบอร์ด (จำกัดชื่อบอร์ดแบบ contains) — `filterBoardCards`
 * ทำงานในขอบเขตบอร์ดเดียวอยู่แล้วจึงไม่ใช้ฟิลด์นี้
 */
export type BoardFilters = {
  q?: string;
  /** `"none"` = ไม่มีผู้รับผิดชอบเลย (K2.4 — ไทล์ "ไม่มีผู้รับผิดชอบ" ของมุมมองสรุป) */
  assignee?: "me" | "none" | (string & {});
  /** `"none"` = ไม่มีป้ายกำกับเลย (K2.4 — ไทล์ "ไม่มีป้ายกำกับ") */
  label?: "none" | (string & {});
  due?: DueBucket;
  status?: CardStatus;
  board?: string;
  /** K2.4 — คอลัมน์ (columnId) กรองเฉพาะการ์ดของคอลัมน์นั้น ใช้เจาะลงจากไทล์ "การ์ดต่อคอลัมน์" ของมุมมองสรุป */
  column?: string;
};

/** มีตัวกรองแกนไหนทำงานอยู่ไหม (ใช้ตัดสินว่าจะโชว์ `FilterBar`/ข้อความ "ไม่มีการ์ดตรงกับตัวกรอง" ไหม) */
export function hasAnyFilter(filters: BoardFilters): boolean {
  return Boolean(filters.q || filters.assignee || filters.label || filters.due || filters.status || filters.column);
}

const DUE_VALUES: readonly DueBucket[] = ["overdue", "today", "week", "none"];
const STATUS_VALUES: readonly CardStatus[] = ["done", "open"];

/**
 * แปลงพารามิเตอร์ URL ดิบ (`?assignee=&label=&due=&status=&q=`) เป็น `BoardFilters` — ต่างจาก
 * `parseSearchQuery` ตรงที่นี่แต่ละแกนมาแยกช่องอยู่แล้ว (ไม่ใช่ข้อความอิสระที่ต้องตัดคำ) ใช้ที่หน้าบอร์ด
 * (`page.tsx` อ่าน `searchParams` แล้วส่งต่อให้ `BoardView`) — ค่าที่ไม่ตรง enum ถูกทิ้งเงียบ ๆ (กันลิงก์พัง)
 */
export function boardFiltersFromParams(params: Record<string, string | undefined>): BoardFilters {
  const filters: BoardFilters = {};
  if (params.assignee) filters.assignee = params.assignee;
  if (params.label) filters.label = params.label;
  if (params.due && (DUE_VALUES as readonly string[]).includes(params.due)) filters.due = params.due as DueBucket;
  if (params.status && (STATUS_VALUES as readonly string[]).includes(params.status)) filters.status = params.status as CardStatus;
  if (params.q) filters.q = params.q;
  if (params.column) filters.column = params.column;
  return filters;
}

// ───────────────────────── parseSearchQuery (บริสุทธิ์) ─────────────────────────
// คำสงวนไทย (สัญญา K1.11) — รองรับคำอังกฤษคู่กันด้วย (ทีมที่ย้ายจาก Trello พิมพ์แบบเดิม · §11.9)
// กติกา: ตัวสุดท้ายชนะในแกนเดียวกัน (ประมวลทีละ token ซ้ายไปขวา แล้วทับค่าก่อนหน้า)

const DUE_WORDS: Record<string, DueBucket> = {
  "เลยกำหนด": "overdue",
  overdue: "overdue",
  "วันนี้": "today",
  today: "today",
  "สัปดาห์นี้": "week",
  week: "week",
  "ไม่กำหนด": "none",
  "ไม่มีกำหนด": "none",
  none: "none",
};

const STATUS_WORDS: Record<string, CardStatus> = {
  "เสร็จ": "done",
  "เสร็จแล้ว": "done",
  done: "done",
  "ยังไม่เสร็จ": "open",
  open: "open",
};

const LABEL_PREFIX = /^(ป้าย|label):(.+)$/i;
const BOARD_PREFIX = /^(บอร์ด|board):(.+)$/i;

/**
 * แปลงข้อความค้นหาภาษาคนเป็นตัวกรอง — บริสุทธิ์ ไม่แตะ DB (แก้ไม่รู้จักชื่อ/userId จริง ๆ ที่นี่
 * — `@ชื่อ` อื่นนอกจาก `@ฉัน` ปล่อยเป็นคำค้นธรรมดา ให้ `searchCards` เป็นคนจับคู่ภายหลัง)
 */
export function parseSearchQuery(text: string): BoardFilters {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const result: BoardFilters = {};
  const rest: string[] = [];

  for (const raw of tokens) {
    const lower = raw.toLowerCase();
    if (raw === "@ฉัน" || lower === "@me") {
      result.assignee = "me";
      continue;
    }
    const labelMatch = LABEL_PREFIX.exec(raw);
    if (labelMatch) {
      result.label = labelMatch[2];
      continue;
    }
    const boardMatch = BOARD_PREFIX.exec(raw);
    if (boardMatch) {
      result.board = boardMatch[2];
      continue;
    }
    if (raw in DUE_WORDS) {
      result.due = DUE_WORDS[raw];
      continue;
    }
    if (lower in DUE_WORDS) {
      result.due = DUE_WORDS[lower];
      continue;
    }
    if (raw in STATUS_WORDS) {
      result.status = STATUS_WORDS[raw];
      continue;
    }
    if (lower in STATUS_WORDS) {
      result.status = STATUS_WORDS[lower];
      continue;
    }
    rest.push(raw);
  }

  if (rest.length > 0) result.q = rest.join(" ");
  return result;
}

// ───────────────────────── filterBoardCards (บริสุทธิ์ · server+client) ─────────────────────────

/**
 * รูปการ์ดแบบกว้าง — ครอบทั้ง `KanbanCard` ดิบของ Prisma (oracle/service ฝั่ง server ที่ยังไม่ join
 * ผู้รับผิดชอบ/ป้ายเป็นอ็อบเจกต์) และ `BoardCardDto` ฝั่ง client (join แล้ว ไม่มี `description`
 * ตามงบประมาณประสิทธิภาพ §12.1) — ทุกฟิลด์เป็น optional ยกเว้น `id`/`title` เพื่อให้ทั้งสองชนิด
 * ผ่าน structural typing ได้โดยไม่ต้อง cast
 */
export type FilterableCard = {
  id: string;
  title: string;
  description?: string | null;
  dueAt?: string | Date | null;
  completedAt?: string | Date | null;
  assigneeUserId?: string | null;
  assignees?: readonly { userId: string }[];
  /** ชื่อป้าย — string[] ดิบ (Json ของ Prisma) หรือ `{name}[]` (BoardLabelDto[]) */
  labels?: unknown;
  /** K2.4 — คอลัมน์ที่การ์ดอยู่ (ใช้กับ `filters.column`) · ไม่มีค่า = ผู้เรียกไม่ได้ผูกคอลัมน์มาให้ (เช่น
   *  `BoardView.tsx` ที่กรองทีละคอลัมน์อยู่แล้วก่อนเรียกฟังก์ชันนี้) ⇒ ไม่ตัดออกเงียบ ๆ */
  columnId?: string;
};

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST)
const DAY_MS = 86_400_000;

function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

/** เลขวันแบบ "วันไทยที่เท่าไหร่นับจาก epoch" — ใช้เทียบว่าสองเวลาอยู่วันเดียวกันไหมตามเวลาไทย */
function bkkDayIndex(ms: number): number {
  return Math.floor((ms + BKK_OFFSET_MS) / DAY_MS);
}

/** เวลา UTC (ms) ของเที่ยงคืนไทยของวันที่ `dayIndex` — ตัวผกผันของ `bkkDayIndex` (ให้ `search.ts` ใช้คำนวณช่วงคิวรีด้วย) */
export function bkkDayStartMs(dayIndex: number): number {
  return dayIndex * DAY_MS - BKK_OFFSET_MS;
}

/** เลขวันไทยของเวลา ms ที่กำหนด (export ให้ `search.ts` คำนวณช่วงคิวรี DB ด้วยสูตรเดียวกัน) */
export function dayIndexOf(ms: number): number {
  return bkkDayIndex(ms);
}

export { BKK_OFFSET_MS };

function labelNamesOf(card: FilterableCard): string[] {
  const raw = card.labels;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push(item);
    } else if (item && typeof item === "object" && "name" in item) {
      const n = (item as { name: unknown }).name;
      if (typeof n === "string") out.push(n);
    }
  }
  return out;
}

function assigneeIdsOf(card: FilterableCard): string[] {
  const ids = new Set<string>();
  if (card.assigneeUserId) ids.add(card.assigneeUserId);
  for (const a of card.assignees ?? []) ids.add(a.userId);
  return [...ids];
}

/**
 * บั๊กเก็ตกำหนดส่งของการ์ด 1 ใบ ณ เวลา `nowMs` (เวลาไทย)
 * ลำดับการตัดสิน (สัญญา K1.11 · §11.8): completedAt ไม่นับเลยกำหนด → วันนี้ → สัปดาห์นี้(ที่เหลือ) → null
 */
export function dueBucketOf(card: FilterableCard, nowMs: number): DueBucket | null {
  const dueMs = toMs(card.dueAt ?? null);
  if (dueMs === null) return "none";
  const isCompleted = toMs(card.completedAt ?? null) !== null;
  if (!isCompleted && dueMs < nowMs) return "overdue";

  const nowDay = bkkDayIndex(nowMs);
  const dueDay = bkkDayIndex(dueMs);
  if (dueDay === nowDay) return "today";

  // สัปดาห์นี้ = จันทร์–อาทิตย์ที่ครอบวันนี้ (ปฏิทินไทย) — วันในอดีตของสัปดาห์นี้ต้องเลยกำหนดไปแล้วเสมอ
  // (ผ่านเงื่อนไข overdue ด้านบนไปแล้วถ้ายังไม่ผ่าน) ⇒ ที่เหลือคือวันในอนาคตของสัปดาห์นี้เท่านั้น
  const nowWeekday = new Date(nowMs + BKK_OFFSET_MS).getUTCDay(); // 0 = อาทิตย์
  const mondayOffset = (nowWeekday + 6) % 7;
  const weekEndDay = nowDay - mondayOffset + 6;
  if (dueDay > nowDay && dueDay <= weekEndDay) return "week";
  return null;
}

/**
 * กรองการ์ดของบอร์ดเดียวด้วยตัวกรองทุกแกน (AND ข้ามแกน) — บริสุทธิ์ ใช้ได้ทั้ง server (oracle/service)
 * และ client (`FilterBar`/`BoardView` กรอง state ที่โหลดมาแล้วโดยไม่ยิง DB ซ้ำ)
 */
export function filterBoardCards<T extends FilterableCard>(
  cards: readonly T[],
  filters: BoardFilters,
  ctx: { now: Date; userId?: string | null },
): T[] {
  const nowMs = ctx.now.getTime();
  const q = filters.q?.trim().toLowerCase();

  return cards.filter((card) => {
    if (filters.label) {
      if (filters.label === "none") {
        if (labelNamesOf(card).length > 0) return false;
      } else if (!labelNamesOf(card).includes(filters.label)) return false;
    }

    if (filters.assignee) {
      if (filters.assignee === "none") {
        if (assigneeIdsOf(card).length > 0) return false;
      } else {
        const target = filters.assignee === "me" ? (ctx.userId ?? null) : filters.assignee;
        if (!target || !assigneeIdsOf(card).includes(target)) return false;
      }
    }

    // K2.4 — เฉพาะผู้เรียกที่ผูก `columnId` มากับการ์ด (table.ts/calendar.ts/summary.ts) ไม่มีค่า = ข้าม
    // (BoardView.tsx กรองทีละคอลัมน์อยู่แล้วก่อนเรียกที่นี่ จึงไม่ต้องผูก columnId ให้)
    if (filters.column && card.columnId !== undefined && card.columnId !== filters.column) return false;

    if (filters.due && dueBucketOf(card, nowMs) !== filters.due) return false;

    if (filters.status) {
      const done = toMs(card.completedAt ?? null) !== null;
      if (filters.status === "done" && !done) return false;
      if (filters.status === "open" && done) return false;
    }

    if (q) {
      const hay = `${card.title} ${card.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

// ───────────────────────── DTO ของ `searchCards` (ชนิดล้วน · ไม่แตะ prisma) ─────────────────────────
// อยู่ที่นี่ (ไม่ใช่ `search.ts`) เพื่อให้ `SearchPalette.tsx` (client) `import type` ได้ตรง ๆ

export type SearchLabelDto = { name: string; color: string };
export type SearchAssigneeDto = { userId: string; name: string };

export type SearchCardDto = {
  id: string;
  cardNo: number | null;
  title: string;
  boardId: string;
  boardName: string;
  columnName: string;
  dueAt: string | null;
  completedAt: string | null;
  labels: SearchLabelDto[];
  assignees: SearchAssigneeDto[];
};

export type SearchCardsResult = {
  items: SearchCardDto[];
  /** ไม่มี = หมดแล้ว */
  nextCursor?: string;
  /** จำนวนการ์ดทั้งหมดที่ตรงตัวกรอง (ไม่รวม cursor) — ข้ามบอร์ดที่ actor มองเห็นเท่านั้น */
  total: number;
};

// ───────────────────────── K2.5 — บรรยายมุมมองที่บันทึกไว้ (บริสุทธิ์) ─────────────────────────
// ใช้ร่วมกันระหว่าง `SavedViewsMenu.tsx` (dropdown หัวบอร์ด) และ `SavedViewsSettings.tsx` (ตั้งค่าบอร์ด)
// อยู่ที่นี่ (ไม่ใช่ `views.ts` ที่แตะ prisma) ด้วยเหตุผลเดียวกับฟังก์ชันอื่นในไฟล์นี้ — ทั้งสองไฟล์เป็น
// client component ต้อง import ได้โดยไม่ลาก `db.ts` → `pg` เข้าบันเดิลฝั่ง browser
import type { ViewConfig } from "./types";

const VIEW_LABEL_TH: Record<ViewConfig["view"], string> = {
  board: "บอร์ด",
  table: "ตาราง",
  calendar: "ปฏิทิน",
  summary: "สรุป",
  timeline: "ไทม์ไลน์",
};

const DUE_LABEL_TH: Record<DueBucket, string> = { overdue: "เลยกำหนด", today: "วันนี้", week: "สัปดาห์นี้", none: "ไม่กำหนด" };

const SORT_LABEL_TH: Record<string, string> = { due: "วันที่", created: "สร้างล่าสุด", updated: "แก้ไขล่าสุด", position: "ลำดับบนบอร์ด" };

/** คำบรรยายเงื่อนไขของมุมมอง (ภาพ 10) — เช่น "ตาราง · กรอง: เลยกำหนด · เรียงตามวันที่" */
export function describeSavedViewConfig(config: ViewConfig): string {
  const parts: string[] = [VIEW_LABEL_TH[config.view] ?? config.view];
  const f = config.filters ?? {};
  const filterBits: string[] = [];
  if (f.due) filterBits.push(DUE_LABEL_TH[f.due] ?? f.due);
  if (f.label) filterBits.push(`ป้าย=${f.label}`);
  if (f.assignee === "me") filterBits.push("ผู้รับผิดชอบ=ฉัน");
  else if (f.assignee) filterBits.push("ผู้รับผิดชอบ=เลือกไว้");
  if (f.status === "done") filterBits.push("เสร็จแล้ว");
  else if (f.status === "open") filterBits.push("ยังไม่เสร็จ");
  if (f.column) filterBits.push("คอลัมน์=เลือกไว้");
  if (f.q) filterBits.push(`ค้นหา "${f.q}"`);
  if (filterBits.length > 0) parts.push(`กรอง: ${filterBits.join(", ")}`);
  if (config.sort) parts.push(`เรียงตาม${SORT_LABEL_TH[config.sort] ?? config.sort}`);
  return parts.join(" · ");
}

/** href ของมุมมองที่บันทึกไว้ — ตรงกับ `buildHref` ของ `views.ts` (server) เป๊ะ (คำนวณฝั่ง client จาก
 * config ที่มีอยู่แล้วในมือ กันไม่ต้องยิง server action ทุกครั้งที่กดแถวในดรอปดาวน์) */
export function hrefForSavedView(pathname: string, viewId: string, config: ViewConfig): string {
  const params = new URLSearchParams();
  if (config.view !== "board") params.set("view", config.view);
  const f = config.filters ?? {};
  if (f.assignee) params.set("assignee", f.assignee);
  if (f.label) params.set("label", f.label);
  if (f.due) params.set("due", f.due);
  if (f.status) params.set("status", f.status);
  if (f.q) params.set("q", f.q);
  if (f.column) params.set("column", f.column);
  if (config.sort) params.set("sort", config.sort);
  if (config.group) params.set("group", config.group);
  params.set("savedView", viewId);
  return `${pathname}?${params.toString()}`;
}
