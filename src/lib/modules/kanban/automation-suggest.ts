// automation-suggest.ts — "คำแนะนำกฎอัตโนมัติจากพฤติกรรมจริง" (K3.6 · แผงขวาในภาพ 08)
//
// 🔴 กติกาเหล็กของไฟล์นี้
//  1) **ข้อเสนอต้องมาจากการนับจริง** — ทุกตัวเลขใน `evidence` มาจากแถว `KanbanActivity` / `KanbanCard`
//     ที่เกิดขึ้นบนบอร์ดใบนั้นเท่านั้น · LLM ห้ามแตะ `evidence` และ `rule` (ดูข้อ 3)
//  2) **ไม่เขียน DB เลย** — คืนร่างกฎ (`KanbanRuleInput`) ให้ตัวสร้างกฎของ K2.9 ไปเติมในฟอร์ม
//     แถว `AutomationRule` เกิดต่อเมื่อคนกด "บันทึกกฎ" เท่านั้น
//  3) **LLM = ตัวเรียบเรียงคำ ไม่ใช่ตัวคิด** — เปิดใช้เมื่อผู้เรียกสั่ง (`opts.polish` หรือส่ง
//     `deps.complete` มาเอง) · ล้ม/ตอบไม่เป็นไทย = ใช้ข้อความ deterministic ต่อ ไม่ throw
//     🔴 ค่าเริ่มต้น = **ไม่เรียก** (หน้าจอโหลดข้อเสนอทุกครั้งที่เปิดหน้า — เรียกโมเดลทุกครั้ง
//        = เผาเครดิตร้านโดยที่ผู้ใช้ไม่ได้สั่ง และทำให้หน้าอัตโนมัติช้าลงเป็นวินาที)
//  4) **ห้าม import `@/lib/ai/*` แบบ static** — ทะเบียน tool/op ถูกโหลดตอน fitness ที่ไม่มี env
//     (บทเรียน K3.5) · เรียกผ่าน `await import(...)` ในฟังก์ชันเท่านั้น
//  5) `now` มาจากผู้เรียกเสมอ (เหมือน `sweepScheduledRules`) — ข้อสอบ/ภาพต้องตรึงเวลาได้
//  6) วันไทย/หน้าต่างเวลาคำนวณเป็น ms ตรง ๆ ห้าม `toLocale*` / `getDay()`
//
// สิทธิ์ = เดียวกับ "ตั้งกฎอัตโนมัติ" (คีย์ `kanban.automation.manage` หรือ OWNER **และ** ADMIN ของบอร์ด)
// เพราะข้อเสนอเปิดเผยพฤติกรรมของทั้งทีมบนบอร์ด (ใครย้ายอะไรซ้ำ ๆ · ใบไหนไม่มีคนรับ)

import { sha256 } from "@/lib/core/hash";
import { KanbanForbiddenError } from "./access";
import { canManageAutomation, type KanbanRuleAction, type KanbanRuleInput } from "./automation";
import { prisma } from "./db";
import { assertBoardRole } from "./members";
import type { KanbanActor, KanbanCtx } from "./types";

// ───────────────────────── ค่าคงที่ ─────────────────────────

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** ต่ำกว่านี้ = ยังไม่ใช่ "พฤติกรรมซ้ำ" แค่เรื่องบังเอิญ (สัญญา §K3.6) */
const MIN_COUNT = 5;
const MAX_SUGGESTIONS = 5;
const SAMPLE_MAX = 3;
/** เพดานแถวกิจกรรมที่ดึงมานับ — บอร์ดที่คึกมากใน 30 วันยังอยู่ในนี้สบาย ๆ */
const ACTIVITY_TAKE = 5000;
/** 🔴 ขาออกไทยกิน token ~4 เท่า (บทเรียน K3.2/K3.5) — ต่ำกว่านี้ JSON ถูกตัดกลางคัน */
const MAX_TOKENS = 1500;
const DEFAULT_DAYS = 30;

// ───────────────────────── ชนิดที่ส่งออก ─────────────────────────

export type KanbanSuggestionPattern = "REPEATED_MANUAL_MOVE" | "LABEL_UNASSIGNED" | "OVERDUE_NO_REMINDER";

export type KanbanSuggestionSample = { cardId: string; title: string; at: Date };

export type KanbanSuggestionEvidence = {
  /** จำนวนครั้ง/จำนวนใบที่นับได้จริงในหน้าต่างเวลา */
  count: number;
  since: Date;
  sample: KanbanSuggestionSample[];
};

export type KanbanSuggestion = {
  /** hash คงที่จาก pattern + พารามิเตอร์ — ข้อเสนอเดิมได้ id เดิมทุกครั้ง (จอจำได้ว่าปิดใบไหนไปแล้ว) */
  id: string;
  pattern: KanbanSuggestionPattern;
  title: string;
  reason: string;
  evidence: KanbanSuggestionEvidence;
  /** ร่างกฎที่ผ่านสคีมาของ K2.9 — ผู้ใช้แก้ได้ก่อนบันทึก */
  rule: KanbanRuleInput;
};

export type KanbanSuggestDeps = { complete?: (prompt: string) => Promise<string> };

export type KanbanSuggestOpts = {
  now?: Date;
  days?: number;
  /** เรียก LLM มาเรียบเรียงคำ (ค่าเริ่มต้น: เรียกก็ต่อเมื่อผู้เรียกส่ง `deps.complete` มาเอง) */
  polish?: boolean;
  deps?: KanbanSuggestDeps;
};

/** รูปที่จอต้องใช้ (ตัด `evidence` ที่มี Date ออก — ข้าม RSC ได้ตรง ๆ) */
export type KanbanSuggestionDto = {
  id: string;
  pattern: KanbanSuggestionPattern;
  title: string;
  reason: string;
  count: number;
  rule: KanbanRuleInput;
};

export function toSuggestionDto(s: KanbanSuggestion): KanbanSuggestionDto {
  return { id: s.id, pattern: s.pattern, title: s.title, reason: s.reason, count: s.evidence.count, rule: s.rule };
}

// ───────────────────────── ตัวช่วยอ่าน `KanbanActivity.data` ─────────────────────────
// 🔴 `data` เป็น Json ที่ถูกเขียนจากหลายรุ่น/หลายทาง (service จริงเขียน `labelIds: []` แบบหมู่
//    แต่ข้อมูลเก่า/ตัวนำเข้าบางตัวเขียน `labelId` เดี่ยว) ⇒ อ่านให้ได้ทั้งสองรูปเสมอ
//    ไม่งั้น "นับจากพฤติกรรมจริง" จะกลายเป็น "นับเฉพาะพฤติกรรมที่รุ่นล่าสุดเขียน"

function obj(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

function str(data: unknown, key: string): string | null {
  const v = obj(data)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** คืน id ทั้งหมดจากคีย์คู่ `xId` / `xIds` */
function ids(data: unknown, single: string, plural: string): string[] {
  const d = obj(data);
  const out: string[] = [];
  const one = d[single];
  if (typeof one === "string" && one) out.push(one);
  const many = d[plural];
  if (Array.isArray(many)) for (const v of many) if (typeof v === "string" && v) out.push(v);
  return out;
}

// ───────────────────────── ข้อมูลดิบของบอร์ด ─────────────────────────

type ActRow = { cardId: string | null; actorUserId: string | null; type: string; data: unknown; createdAt: Date };

const COUNTED_TYPES = ["CARD_CREATED", "CARD_MOVED", "CARD_LABELED", "CARD_ASSIGNED"] as const;

async function loadActivities(ctx: KanbanCtx, boardId: string, since: Date, now: Date): Promise<ActRow[]> {
  const rows = await prisma.kanbanActivity.findMany({
    where: {
      tenantId: ctx.tenantId,
      boardId,
      type: { in: [...COUNTED_TYPES] },
      createdAt: { gte: since, lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: ACTIVITY_TAKE,
    select: { cardId: true, actorUserId: true, type: true, data: true, createdAt: true },
  });
  return rows.map((r) => ({ cardId: r.cardId, actorUserId: r.actorUserId, type: String(r.type), data: r.data, createdAt: r.createdAt }));
}

/** id → ชื่อ ของคอลัมน์/ป้ายบนบอร์ด (ข้อเสนอที่อ้างของที่ถูกลบไปแล้ว = ไม่ต้องเสนอ) */
async function loadBoardNames(ctx: KanbanCtx, boardId: string): Promise<{ columns: Map<string, string>; labels: Map<string, string> }> {
  const [columns, labels] = await Promise.all([
    prisma.kanbanColumn.findMany({ where: { tenantId: ctx.tenantId, boardId, status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.kanbanLabel.findMany({ where: { tenantId: ctx.tenantId, boardId }, select: { id: true, name: true } }),
  ]);
  return {
    columns: new Map(columns.map((c) => [c.id, c.name])),
    labels: new Map(labels.map((l) => [l.id, l.name])),
  };
}

async function loadCardTitles(cardIds: string[]): Promise<Map<string, string>> {
  if (cardIds.length === 0) return new Map();
  const rows = await prisma.kanbanCard.findMany({ where: { id: { in: cardIds } }, select: { id: true, title: true } });
  return new Map(rows.map((r) => [r.id, r.title]));
}

/**
 * คนที่ควรถูกมอบหมายโดยอัตโนมัติ = ผู้ดูแลบอร์ดคนแรก · ไม่มี = ผู้จัดการ/เจ้าของร้านคนแรก
 * (ต้องเป็นสมาชิกร้านที่ตอบรับแล้ว ไม่งั้น `createRule` จะตีกลับตอนผู้ใช้กดบันทึก)
 */
async function pickAssignee(ctx: KanbanCtx, boardId: string): Promise<string | null> {
  const admins = await prisma.kanbanBoardMember.findMany({
    where: { tenantId: ctx.tenantId, boardId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  const candidates = admins.map((a) => a.userId);
  if (candidates.length > 0) {
    const ok = await prisma.membership.findFirst({
      where: { tenantId: ctx.tenantId, userId: { in: candidates }, acceptedAt: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (ok) return ok.userId;
  }
  const fallback = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, acceptedAt: { not: null }, role: { in: ["OWNER", "MANAGER"] } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { userId: true },
  });
  return fallback?.userId ?? null;
}

// ───────────────────────── ตัวประกอบข้อเสนอ ─────────────────────────

const hashId = (pattern: string, parts: string[]): string => `${pattern.toLowerCase()}-${sha256([pattern, ...parts].join("|")).slice(0, 16)}`;

const cut = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** ชื่อกฎมีเพดาน 120 ตัวอักษรใน zod ของ K2.9 — ตัดที่นี่ ไม่ใช่ปล่อยให้ผู้ใช้กดบันทึกแล้วเด้ง */
const ruleName = (s: string): string => cut(s, 120);

// ───────────────────────── แบบที่ 1: ย้ายการ์ดเส้นเดิมด้วยมือซ้ำ ๆ ─────────────────────────

function repeatedManualMove(
  acts: ActRow[],
  boardId: string,
  names: { columns: Map<string, string> },
  since: Date,
  days: number,
): KanbanSuggestion[] {
  const buckets = new Map<string, { from: string; to: string; rows: ActRow[] }>();
  for (const a of acts) {
    if (a.type !== "CARD_MOVED" || !a.actorUserId || !a.cardId) continue;
    const from = str(a.data, "fromColumnId");
    const to = str(a.data, "toColumnId");
    if (!from || !to || from === to) continue;
    // คอลัมน์ที่ถูกลบ/เก็บไปแล้ว = เสนอกฎที่บันทึกไม่ได้ ⇒ ข้าม
    if (!names.columns.has(from) || !names.columns.has(to)) continue;
    const key = `${from}>${to}`;
    const b = buckets.get(key) ?? { from, to, rows: [] };
    b.rows.push(a);
    buckets.set(key, b);
  }

  const out: KanbanSuggestion[] = [];
  for (const b of buckets.values()) {
    if (b.rows.length < MIN_COUNT) continue;
    const fromName = names.columns.get(b.from) ?? "คอลัมน์เดิม";
    const toName = names.columns.get(b.to) ?? "คอลัมน์ปลายทาง";
    const count = b.rows.length;
    const latest = [...b.rows].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, SAMPLE_MAX);
    const rule: KanbanRuleInput = {
      boardId,
      name: ruleName(`เช็คลิสต์ครบ → ย้ายจาก “${fromName}” ไป “${toName}”`),
      kind: "RULE",
      event: "kanban.checklist.completed",
      conditions: [{ field: "column", op: "is", value: b.from }],
      actions: [{ type: "move_column", params: { columnId: b.to } }],
    };
    out.push({
      id: hashId("REPEATED_MANUAL_MOVE", [boardId, b.from, b.to]),
      pattern: "REPEATED_MANUAL_MOVE",
      title: `คุณย้ายการ์ดจาก “${fromName}” ไป “${toName}” เองซ้ำ ๆ ${count} ครั้ง`,
      reason: `ใน ${days} วันที่ผ่านมา มีคนย้ายการ์ดเส้นทางนี้ด้วยมือ ${count} ครั้ง — ตั้งกฎให้ระบบย้ายให้เองเมื่อเช็คลิสต์ในการ์ดครบทุกข้อ จะได้ไม่ต้องมานั่งย้ายซ้ำอีก`,
      evidence: { count, since, sample: latest.map((r) => ({ cardId: r.cardId ?? "", title: "", at: r.createdAt })) },
      rule,
    });
  }
  return out;
}

// ───────────────────────── แบบที่ 2: การ์ดป้ายนี้ไม่มีใครรับใน 1 ชม.แรก ─────────────────────────

function labelUnassigned(
  acts: ActRow[],
  boardId: string,
  names: { labels: Map<string, string> },
  since: Date,
  assigneeUserId: string | null,
): KanbanSuggestion[] {
  const createdAt = new Map<string, Date>();
  const assignedAt = new Map<string, Date[]>();
  const labelsOf = new Map<string, Set<string>>();
  for (const a of acts) {
    if (!a.cardId) continue;
    if (a.type === "CARD_CREATED") {
      const prev = createdAt.get(a.cardId);
      if (!prev || a.createdAt.getTime() < prev.getTime()) createdAt.set(a.cardId, a.createdAt);
    } else if (a.type === "CARD_ASSIGNED") {
      assignedAt.set(a.cardId, [...(assignedAt.get(a.cardId) ?? []), a.createdAt]);
    } else if (a.type === "CARD_LABELED") {
      const set = labelsOf.get(a.cardId) ?? new Set<string>();
      for (const id of ids(a.data, "labelId", "labelIds")) set.add(id);
      labelsOf.set(a.cardId, set);
    }
  }

  const byLabel = new Map<string, { cardId: string; at: Date }[]>();
  for (const [cardId, birth] of createdAt) {
    const deadline = birth.getTime() + HOUR_MS;
    const gotOwner = (assignedAt.get(cardId) ?? []).some((t) => t.getTime() >= birth.getTime() && t.getTime() <= deadline);
    if (gotOwner) continue;
    for (const labelId of labelsOf.get(cardId) ?? []) {
      if (!names.labels.has(labelId)) continue; // ป้ายถูกลบไปแล้ว
      byLabel.set(labelId, [...(byLabel.get(labelId) ?? []), { cardId, at: birth }]);
    }
  }

  const out: KanbanSuggestion[] = [];
  for (const [labelId, cards] of byLabel) {
    if (cards.length < MIN_COUNT) continue;
    const labelName = names.labels.get(labelId) ?? "ป้ายนี้";
    const count = cards.length;
    const latest = [...cards].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, SAMPLE_MAX);
    const action: KanbanRuleAction = assigneeUserId
      ? { type: "assign", params: { userId: assigneeUserId } }
      : { type: "notify", params: { to: "admins", message: `การ์ดป้าย “${labelName}” ใบใหม่ยังไม่มีผู้รับผิดชอบ` } };
    const rule: KanbanRuleInput = {
      boardId,
      name: ruleName(`การ์ดใหม่ป้าย “${labelName}” → ${assigneeUserId ? "มอบหมายให้ผู้ดูแลบอร์ด" : "แจ้งผู้ดูแลบอร์ด"}`),
      kind: "RULE",
      event: "kanban.card.created",
      conditions: [{ field: "label", op: "has", value: labelId }],
      actions: [action],
    };
    out.push({
      id: hashId("LABEL_UNASSIGNED", [boardId, labelId]),
      pattern: "LABEL_UNASSIGNED",
      title: `การ์ดป้าย “${labelName}” ไม่เคยมีผู้รับผิดชอบใน 1 ชม.แรก ${count} ใบ`,
      reason: `นับจากประวัติจริงของบอร์ด: การ์ดที่ติดป้าย “${labelName}” ${count} ใบ ผ่านชั่วโมงแรกไปโดยยังไม่มีชื่อคนรับ — ${assigneeUserId ? "ให้ระบบมอบหมายหัวหน้างานให้ทันทีที่การ์ดเกิด" : "ให้ระบบเตือนผู้ดูแลบอร์ดทันทีที่การ์ดเกิด"}`,
      evidence: { count, since, sample: latest.map((c) => ({ cardId: c.cardId, title: "", at: c.at })) },
      rule,
    });
  }
  return out;
}

// ───────────────────────── แบบที่ 3: เลยกำหนดโดยไม่มีใครเตือนล่วงหน้า ─────────────────────────

async function overdueNoReminder(
  ctx: KanbanCtx,
  boardId: string,
  since: Date,
  now: Date,
): Promise<KanbanSuggestion[]> {
  const rows = await prisma.kanbanCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      boardId,
      status: "ACTIVE",
      completedAt: null,
      reminderMinutesBefore: null,
      dueAt: { gte: since, lt: now },
    },
    orderBy: { dueAt: "desc" },
    select: { id: true, title: true, dueAt: true },
    take: 200,
  });
  if (rows.length < MIN_COUNT) return [];
  const count = rows.length;
  const rule: KanbanRuleInput = {
    boardId,
    name: ruleName("2 วันก่อนครบกำหนด → เตือนผู้รับผิดชอบ"),
    kind: "DUE_DATE",
    dueOffsetDays: -2,
    conditions: [],
    actions: [{ type: "notify", params: { to: "assignees", message: "งาน {ชื่อการ์ด} จะครบกำหนดในอีก 2 วัน" } }],
  };
  return [
    {
      id: hashId("OVERDUE_NO_REMINDER", [boardId]),
      pattern: "OVERDUE_NO_REMINDER",
      title: `มีการ์ดเลยกำหนดส่งโดยไม่ได้ตั้งเตือนล่วงหน้า ${count} ใบ`,
      reason: `การ์ด ${count} ใบบนบอร์ดนี้เลยกำหนดส่งไปแล้วทั้งที่ไม่มีการเตือนล่วงหน้าเลย — ตั้งกฎเตือนผู้รับผิดชอบ 2 วันก่อนครบกำหนดให้ทุกใบอัตโนมัติ`,
      evidence: {
        count,
        since,
        sample: rows.slice(0, SAMPLE_MAX).map((r) => ({ cardId: r.id, title: r.title, at: r.dueAt ?? now })),
      },
      rule,
    },
  ];
}

// ───────────────────────── LLM: เรียบเรียงคำอย่างเดียว ─────────────────────────
// 🔴 prompt เป็นภาษาอังกฤษ (ไทยกิน token ~4 เท่า — [[reference_llm_thai_token_cost]])
//    ข้อมูลไทย (ชื่อคอลัมน์/ป้าย/ตัวเลข) แนบเป็น data ท้าย prompt · ผลลัพธ์ที่ผู้ใช้เห็นเป็นไทย

function polishPrompt(s: KanbanSuggestion): string {
  return [
    "You rewrite one automation suggestion shown to a Thai small-business owner inside a task-board app.",
    "Rules:",
    "- Reply with JSON only: {\"title\":\"...\",\"reason\":\"...\"}",
    "- Both fields MUST be written in Thai, plain everyday words, no emoji, no markdown.",
    "- title: one short line (<= 80 chars) naming what keeps happening. Keep EVERY number and EVERY quoted name exactly as given.",
    "- reason: one or two sentences telling the owner what the rule would do for them. Do not invent numbers or facts.",
    "- Never change, drop or round the count.",
    "",
    "DATA (Thai, do not translate the names):",
    JSON.stringify({
      pattern: s.pattern,
      count: s.evidence.count,
      currentTitle: s.title,
      currentReason: s.reason,
      ruleSentence: { event: s.rule.event ?? s.rule.kind, actions: s.rule.actions.map((a) => a.type) },
    }),
  ].join("\n");
}

function readPolished(raw: string): { title: string; reason: string } | null {
  const text = raw.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const o = obj(parsed);
  const title = typeof o.title === "string" ? o.title.replace(/\s+/g, " ").trim() : "";
  const reason = typeof o.reason === "string" ? o.reason.replace(/\s+/g, " ").trim() : "";
  // ตอบไม่เป็นไทย = ตัวเรียบเรียงพัง (ไม่ใช่ "คำที่ดีกว่า") ⇒ ทิ้ง ใช้ข้อความ deterministic ต่อ
  if (!/[ก-๙]/.test(title) || !/[ก-๙]/.test(reason)) return null;
  return { title: cut(title, 200), reason: cut(reason, 400) };
}

/** ตัวเรียกโมเดลของร้าน — ไม่มีคีย์/เครดิตหมด = คืน null (ไม่ throw · คำแนะนำต้องยังขึ้นจอ) */
async function storeCompletion(ctx: KanbanCtx): Promise<((prompt: string) => Promise<string>) | null> {
  try {
    const providerMod = await import("@/lib/ai/provider");
    const provider = providerMod.resolveProvider("smart");
    if (!provider) return null;
    const credit = await import("@/lib/ai/credit");
    if (!(await credit.canSpend(ctx.tenantId))) return null;
    return async (prompt: string) => {
      const reply = await provider.chat([{ role: "user", content: prompt }], { maxTokens: MAX_TOKENS });
      await credit.chargeUsageSafe(
        { tenantId: ctx.tenantId },
        {
          // หนี้เดียวกับ K3.5: enum `AiCreditSource` ยังไม่มีช่องของบอร์ดงาน
          source: "CHAT_SUGGEST",
          model: reply.model || providerMod.SMART_MODEL,
          tokensIn: reply.tokensIn,
          tokensOut: reply.tokensOut,
          ...(ctx.actorUserId ? { userId: ctx.actorUserId } : {}),
          note: "เรียบเรียงคำแนะนำกฎอัตโนมัติ (K3.6)",
        },
      );
      return reply.text;
    };
  } catch {
    return null;
  }
}

async function polishAll(ctx: KanbanCtx, list: KanbanSuggestion[], opts?: KanbanSuggestOpts): Promise<KanbanSuggestion[]> {
  const wants = opts?.polish ?? !!opts?.deps?.complete;
  if (!wants || list.length === 0) return list;
  const complete = opts?.deps?.complete ?? (await storeCompletion(ctx));
  if (!complete) return list;
  const out: KanbanSuggestion[] = [];
  for (const s of list) {
    let better: { title: string; reason: string } | null = null;
    try {
      better = readPolished(await complete(polishPrompt(s)));
    } catch {
      better = null; // โมเดลล่ม = ใช้ข้อความ deterministic ต่อ (ห้าม throw — ข้อเสนอยังถูกต้องทุกตัวเลข)
    }
    // 🔴 คัดลอก `evidence`/`rule` ของเดิมมาทั้งก้อน — LLM แตะได้แค่ 2 ช่องนี้เท่านั้น
    out.push(better ? { ...s, title: better.title, reason: better.reason } : s);
  }
  return out;
}

// ───────────────────────── ตัวหลัก ─────────────────────────

/**
 * คำแนะนำกฎอัตโนมัติของบอร์ด 1 ใบ — เรียงตามจำนวนครั้งที่พบมากก่อน
 * ไม่มีพฤติกรรมซ้ำถึงเกณฑ์ (< 5) = `[]` (จอขึ้นข้อความ "ยังไม่พบพฤติกรรมซ้ำพอจะแนะนำ")
 */
export async function suggestRules(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts?: KanbanSuggestOpts,
): Promise<KanbanSuggestion[]> {
  // ด่านเดียวกับการตั้งกฎ (K2.9): ADMIN ของบอร์ด **และ** คีย์ `kanban.automation.manage`
  await assertBoardRole({ ...ctx, actor }, boardId, "ADMIN");
  if (!canManageAutomation(actor)) {
    throw new KanbanForbiddenError("ต้องมีสิทธิ์ “ตั้งกฎอัตโนมัติของบอร์ด” ถึงจะดูคำแนะนำได้");
  }

  const now = opts?.now ?? new Date();
  const days = Math.min(Math.max(opts?.days ?? DEFAULT_DAYS, 1), 365);
  const since = new Date(now.getTime() - days * DAY_MS);

  const [acts, names, assigneeUserId] = await Promise.all([
    loadActivities(ctx, boardId, since, now),
    loadBoardNames(ctx, boardId),
    pickAssignee(ctx, boardId),
  ]);

  const drafts = [
    ...repeatedManualMove(acts, boardId, names, since, days),
    ...labelUnassigned(acts, boardId, names, since, assigneeUserId),
    ...(await overdueNoReminder(ctx, boardId, since, now)),
  ];
  if (drafts.length === 0) return [];

  // เติมชื่อการ์ดของตัวอย่าง (หลักฐานต้องคลิกกลับไปดูใบจริงได้ ไม่ใช่แค่ตัวเลข)
  const wanted = drafts.flatMap((d) => d.evidence.sample.map((s) => s.cardId)).filter((id) => id.length > 0);
  const titles = await loadCardTitles([...new Set(wanted)]);
  for (const d of drafts) {
    d.evidence.sample = d.evidence.sample
      .filter((s) => s.cardId.length > 0)
      .map((s) => ({ ...s, title: s.title || titles.get(s.cardId) || "การ์ดที่ถูกลบไปแล้ว" }));
  }

  const sorted = drafts
    // count เท่ากัน → เรียงตาม id เพื่อให้ลำดับคงที่ข้ามการเรียก (ข้อสอบ S1.4 เทียบสตริง id ทั้งชุด)
    .sort((a, b) => b.evidence.count - a.evidence.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_SUGGESTIONS);

  return polishAll(ctx, sorted, opts);
}
