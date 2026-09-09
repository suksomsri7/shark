// kanban-ops.ts — สะพานระหว่าง "ทะเบียน op ของ API บอร์ดงาน" กับ "ผู้ช่วย AI" (K1.15 · D15)
//
// 🔴 หลักการเดียวของไฟล์นี้ (เหมือน `account-ops.ts` เป๊ะ ๆ): **ไม่มีตรรกะบอร์ดงานของตัวเอง**
//    ทุกอย่างที่ทำได้ = op ที่ประกาศ `tool` ไว้ในทะเบียน (`KANBAN_OPS`) เท่านั้น
//    ⇒ เพิ่มความสามารถให้ผู้ช่วย = ใส่ `tool: { name, hint }` ให้ op นั้น ไม่ต้องแก้ไฟล์นี้
//    ⇒ สคีมา · การตรวจ input · สิทธิ์ · audit = ตัวเดียวกับ REST (ผ่าน `src/lib/api/run.ts`) ห้ามลอกซ้ำ
//
// ทางเดินของงาน:
//   อ่าน (kind read)           → รันทันทีด้วย actor `assistant` (อ่านอย่างเดียว) → คืน JSON ให้โมเดลเรียบเรียง
//   เขียน/อันตราย (write/danger) → **ไม่ทำ** แต่คืน "ข้อเสนอ" ให้เจ้าของกดยืนยัน (proposals.ts)
//                                  ตอนยืนยันจึงรันด้วย actor `user` = สิทธิ์ของคนกดจริง
//
// ไฟล์นี้ห้าม import `./proposals` (proposals ต้อง import ที่นี่เพื่อ derive KIND_ACCESS — จะเป็นวงกลม)

import { z } from "zod";
import { prisma, tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import { jsonSchemaOf, type JsonSchema } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { mapError } from "@/lib/api/respond";
import { detailsMessageTh, runOpAsActor, validateOpInput, validateWith } from "@/lib/api/run";
import { KANBAN_DENY_TH, kanbanScopesCan } from "@/lib/modules/kanban/api/actor";
// ประโยควันเวลาไทย (ไฟล์บริสุทธิ์ของโมดูล ไม่แตะ prisma) — การ์ดยืนยันต้องอ่านออกว่า "วันไหน"
import { thaiDayTime } from "@/lib/modules/kanban/activity-text";
import { KANBAN_OPS } from "@/lib/modules/kanban/api/registry";
import type { KanbanToolAdapter, KanbanToolCall } from "./kanban-adapter";
// K3.5 — op ที่ "ต่อสองโมดูลเข้าด้วยกัน" อยู่ที่ชั้นนี้ ไม่ใช่ในทะเบียนของโมดูลบอร์ดงาน (ดูหัวไฟล์นั้น)
import { CARD_FROM_CHAT_ADAPTER, CARD_FROM_CHAT_OP } from "./kanban-op-from-chat";

// ─────────────────────────────────────────────────────────────────────────────
// 1. ผู้กระทำ (actor) ของฝั่ง AI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * สิทธิ์ของ actor `assistant` — **อ่านอย่างเดียวเท่านั้น**
 * ครอบ scope ของ op read ทุกตัวที่เปิดเป็น tool
 * ด่านจริงที่กันการเขียนคือ `runKanbanTool` ที่ยอมรันทันทีเฉพาะ `op.kind === "read"`
 * 🔴 K2.12: เพิ่ม `kanban.report.view` — tool `kanban_overdue_report`/`kanban_workload_report`
 *    (op `reports.overdue`/`reports.workload`) ผ่าน `reports.ts#assertReportAccess` ที่ต้องมีคีย์นี้
 *    ชัด ๆ เสมอ (ไม่ได้มาฟรีจาก `kanban.board.read` เหมือนคีย์อื่นของโมดูล — ดูหัวไฟล์ reports.ts/access.ts)
 *    ผู้ช่วย AI ในแอปอ่านรายงานแทนเจ้าของร้านได้เสมอ (ผู้เรียก AI คือคนที่ล็อกอินอยู่แล้วในร้านตัวเอง)
 */
const ASSISTANT_READ_SCOPES = ["kanban.board.read", "kanban.report.view"] as const;

function assistantActor(tenantId: string, systemId: string): ApiActor {
  const scopes = [...ASSISTANT_READ_SCOPES];
  return {
    kind: "assistant",
    module: "kanban",
    tenantId,
    systemId,
    keyName: "ผู้ช่วย AI",
    scopes,
    membership: membershipFromScopes(scopes),
    can: (action) => kanbanScopesCan(scopes, action),
    denyMessageTh: KANBAN_DENY_TH,
  };
}

/** actor ของ "คนที่กดยืนยันข้อเสนอ" — สิทธิ์คือ Membership จริงของคนคนนั้น (OWNER/MANAGER ผ่านหมด) */
function userActor(tenantId: string, systemId: string, m: MembershipCtx, userId?: string | null): ApiActor {
  return {
    kind: "user",
    module: "kanban",
    tenantId,
    systemId,
    userId: userId ?? null,
    keyName: "ผู้ช่วย AI (ผู้ใช้ยืนยัน)",
    scopes: [],
    membership: m,
    // คนกดยืนยัน = ใช้ RBAC ของคนคนนั้นตรง ๆ (เหมือนกดปุ่มบนหน้าจอ) ผ่าน evaluate ของ membership
    can: (action) => kanbanMembershipCan(m, action),
    denyMessageTh: KANBAN_DENY_TH,
  };
}

/** สิทธิ์ของ "คน" ต่อ action ของบอร์ดงาน — ความหมายเดียวกับ `assertKanbanCan` ของ actions.ts */
function kanbanMembershipCan(m: MembershipCtx, action: string): boolean {
  if (m.role === "OWNER" || m.role === "MANAGER") return true;
  if (m.permissions[action] === true || m.permissions["kanban.*"] === true) return true;
  // §6.1: มีคีย์ `kanban.*` ตัวใดตัวหนึ่ง = อ่านได้ (backward compat ของ K1.3)
  if (action === "kanban.board.read") {
    return Object.entries(m.permissions).some(([k, v]) => k.startsWith("kanban.") && v === true);
  }
  return false;
}

/**
 * ระบบบอร์ดงานของร้าน
 * - `systemId` = ระบบที่ถูกล็อกมาจากชั้นบน (คีย์ API ที่ผูกไว้ / หัว `X-Shark-System`)
 *   🔴 ค้นผ่าน `tenantDb` เสมอ ⇒ id ของร้านอื่นหาไม่เจอ (คืน null) ไม่ใช่ "หาไม่เจอแล้วตกไประบบแรก"
 */
async function findKanbanSystem(
  tenantId: string,
  opts: { systemName?: string; systemId?: string } = {},
): Promise<{ id: string; name: string } | null> {
  if (opts.systemId) {
    return tenantDb({ tenantId }).appSystem.findFirst({
      where: { id: opts.systemId, type: "KANBAN" },
      select: { id: true, name: true },
    });
  }
  const systems = await tenantDb({ tenantId }).appSystem.findMany({
    where: { type: "KANBAN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (systems.length === 0) return null;
  const want = opts.systemName?.trim().toLowerCase();
  if (want) {
    const hit = systems.find((s) => s.name.toLowerCase().includes(want));
    if (hit) return hit;
  }
  return systems[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ตัวปรับสคีมาต่อ tool — มีเฉพาะตัวที่สคีมาของ REST ไม่เหมาะให้ผู้ช่วยกรอกตรง ๆ
// ─────────────────────────────────────────────────────────────────────────────

const myTasksArgs = z
  .object({
    assignee: z
      .string()
      .max(120)
      .optional()
      .describe("Name or email of the staff member whose tasks to read. Omit only when the caller already knows the user id."),
    userId: z.string().max(40).optional().describe("User id, when it is already known."),
  })
  .strict();

/**
 * K3.5 — "การ์ดใบไหน": ผู้ช่วยคุยกับคนด้วย **เลขการ์ด** ที่คนเห็นบนจอ ("#128 ในบอร์ดงานร้าน")
 * ไม่ใช่รหัสภายใน ⇒ ทุก tool ที่ทำงานกับการ์ด 1 ใบรับได้ทั้ง `cardId` และ `cardNo + boardName`
 * (สคีมาของ REST ยังเป็น path param เหมือนเดิม — แปลงให้ที่นี่ที่เดียว ไม่มี op ตัวที่สอง)
 */
const CARD_TARGET_ARGS = {
  cardId: z.string().max(40).optional().describe("Internal id of the card, when a previous tool already returned it."),
  cardNo: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Card number as shown on the board, for example 128. Give boardName as well when several boards exist."),
  boardName: z.string().max(120).optional().describe("Name of the board the card number belongs to."),
} as const;

async function resolveCardTarget(a: Record<string, unknown>, tenantId: string, systemId: string): Promise<string> {
  const cardId = typeof a.cardId === "string" ? a.cardId.trim() : "";
  if (cardId) return cardId;
  const cardNo = typeof a.cardNo === "number" ? a.cardNo : null;
  if (cardNo === null) throw new Error("ต้องบอกรหัสการ์ด (cardId) หรือเลขการ์ด (cardNo) พร้อมชื่อบอร์ด");
  const boardName = typeof a.boardName === "string" ? a.boardName.trim() : "";
  const db = tenantDb({ tenantId, systemId });
  const boards = await db.kanbanBoard.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
  const want = boardName.toLowerCase();
  const scope = want ? boards.filter((b) => b.name.toLowerCase().includes(want)) : boards;
  if (scope.length === 0) throw new Error(`ไม่พบบอร์ดชื่อ "${boardName}" ในระบบบอร์ดงานนี้`);
  const rows = await db.kanbanCard.findMany({
    where: { cardNo, boardId: { in: scope.map((b) => b.id) } },
    select: { id: true },
    take: 2,
  });
  if (rows.length === 0) throw new Error(`ไม่พบการ์ด #${cardNo}${boardName ? ` ในบอร์ด "${boardName}"` : ""}`);
  if (rows.length > 1) throw new Error(`เลขการ์ด #${cardNo} มีอยู่ในหลายบอร์ด — บอกชื่อบอร์ดด้วย`);
  return rows[0]!.id;
}

/** ตัวปรับของ op ที่ทำงานกับการ์ด 1 ใบ — สคีมา = input เดิมของ op + วิธีชี้การ์ด (ไม่ลอก input ซ้ำ) */
function cardTargetAdapter(opId: string): KanbanToolAdapter {
  const base = KANBAN_OPS.find((o) => o.id === opId)?.input;
  const args = base instanceof z.ZodObject ? base.extend(CARD_TARGET_ARGS) : z.object(CARD_TARGET_ARGS).strict();
  return {
    args,
    toCall: async (a, tenantId, systemId) => {
      const input: Record<string, unknown> = { ...a };
      delete input.cardId;
      delete input.cardNo;
      delete input.boardName;
      return { input, params: { id: await resolveCardTarget(a, tenantId, systemId) } };
    },
  };
}

const ADAPTERS: Record<string, KanbanToolAdapter> = {
  // K3.5 — "สร้างการ์ดจากแชท": ตัวปรับอ่านบทสนทนาจริงแล้วร่างเนื้อการ์ดให้ครบก่อนเสนอ
  "cards.fromChat": CARD_FROM_CHAT_ADAPTER,
  // K3.5 — อ่านการ์ดฉบับเต็ม / ตั้งกำหนดส่ง: ชี้การ์ดด้วยเลขการ์ดที่คนพูดถึงได้
  "cards.detail": cardTargetAdapter("cards.detail"),
  "cards.setDue": cardTargetAdapter("cards.setDue"),
  // "งานของใคร": ผู้ช่วยรู้แค่ชื่อ/อีเมลของพนักงาน (ToolCtx ไม่มี userId — AiConversation ไม่ผูกคน)
  // ⇒ แปลงชื่อเป็น userId ให้ก่อน แล้วค่อยเรียก op เดิม (ตรรกะสิทธิ์ยังอยู่ที่ op ตัวเดียว)
  "my-tasks": {
    args: myTasksArgs,
    description:
      "The task inbox of one staff member: cards grouped by due date (overdue, today, this week, later), checklist items assigned to them and weekly counters. Give the person's name or email.",
    toCall: async (a, tenantId) => {
      if (typeof a.userId === "string" && a.userId.trim()) return { input: { userId: a.userId.trim() } };
      const assignee = typeof a.assignee === "string" ? a.assignee.trim() : "";
      if (!assignee) throw new Error("ต้องบอกชื่อหรืออีเมลของพนักงานที่จะดูงาน");
      const members = await prisma.membership.findMany({
        where: {
          tenantId,
          OR: [
            { user: { name: { contains: assignee, mode: "insensitive" } } },
            { user: { email: { contains: assignee, mode: "insensitive" } } },
          ],
        },
        select: { userId: true },
        take: 2,
      });
      if (members.length === 0) throw new Error(`ไม่พบพนักงานชื่อ "${assignee}" ในร้านนี้`);
      if (members.length > 1) throw new Error(`ชื่อ "${assignee}" ตรงกับพนักงานหลายคน — ระบุให้ชัดกว่านี้`);
      return { input: { userId: members[0]!.userId } };
    },
  },
};

/** ชื่ออาร์กิวเมนต์ของ path param — `{id}` ของ `/boards/{id}/cards` = `boardId` */
function pathArgsOf(op: ApiOp): { arg: string; param: string }[] {
  const segments = op.path.split("/").filter(Boolean);
  const out: { arg: string; param: string }[] = [];
  segments.forEach((seg, i) => {
    if (!seg.startsWith("{") || !seg.endsWith("}")) return;
    const param = seg.slice(1, -1);
    if (param !== "id") {
      out.push({ arg: param, param });
      return;
    }
    const owner = segments[i - 1] ?? "";
    const singular = owner.replace(/s$/, "");
    const camel = singular.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    out.push({ arg: `${camel}Id`, param });
  });
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** สคีมา JSON ของ tool = path param + สคีมา input (หรือของ adapter) */
function parametersOf(op: ApiOp): JsonSchema {
  const adapter = ADAPTERS[op.id];
  const schemaOfTool = adapter?.args ?? op.input;
  const base = schemaOfTool ? jsonSchemaOf(schemaOfTool, "input") : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (!adapter?.args) {
    for (const { arg } of pathArgsOf(op)) {
      properties[arg] = {
        type: "string",
        minLength: 1,
        description: "Id of the record this operation works on (use the matching list tool to find it).",
      };
      required.push(arg);
    }
  }
  const baseProps = isRecord(base.properties) ? base.properties : {};
  for (const [k, v] of Object.entries(baseProps)) properties[k] = v;
  if (Array.isArray(base.required)) for (const r of base.required) required.push(String(r));
  const schema: JsonSchema = { type: "object", properties, additionalProperties: false };
  if (required.length > 0) schema.required = required;
  if (base.$defs !== undefined) schema.$defs = base.$defs;
  return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ทะเบียน tool ของสกิล (สร้างจาก KANBAN_OPS ตัวเดียว)
// ─────────────────────────────────────────────────────────────────────────────

export type KanbanToolInfo = {
  name: string;
  opId: string;
  /** read = ทำทันที · write/danger = ต้องมีคนยืนยัน */
  write: boolean;
  danger: boolean;
  description: string;
  parameters: JsonSchema;
};

let toolCache: KanbanToolInfo[] | null = null;

/**
 * op ที่มีเฉพาะฝั่งผู้ช่วย AI (ไม่มี endpoint REST) — ตัวที่ "ต่อสองโมดูลเข้าด้วยกัน"
 * 🔴 ทะเบียน REST (`KANBAN_OPS`) เป็นของโมดูลบอร์ดงานล้วน ๆ และห้ามรู้จักโมดูลอื่น (ด่าน F2)
 *    op แบบนี้จึงอยู่ที่ composition root ของ AI แทน — ดูเหตุผลเต็มที่หัว `kanban-op-from-chat.ts`
 */
const AI_ONLY_OPS: ApiOp[] = [CARD_FROM_CHAT_OP];

/** op ทุกตัวที่ประกาศ `tool` — แหล่งความจริงเดียวของทั้งสกิล */
export function kanbanToolOps(): ApiOp[] {
  return [...KANBAN_OPS, ...AI_ONLY_OPS].filter((o) => o.tool);
}

export function kanbanToolInfos(): KanbanToolInfo[] {
  if (toolCache) return toolCache;
  toolCache = kanbanToolOps().map((op) => {
    const tool = op.tool!;
    const adapter = ADAPTERS[op.id];
    const description = [adapter?.description ?? op.summary, tool.hint ?? ""].filter(Boolean).join(" ");
    return {
      name: tool.name,
      opId: op.id,
      write: op.kind !== "read",
      danger: op.kind === "danger",
      description,
      parameters: parametersOf(op),
    };
  });
  return toolCache;
}

export function kanbanToolNames(): string[] {
  return kanbanToolInfos().map((t) => t.name);
}

const KIND_PREFIX = "kanban.";

/** ประเภทข้อเสนอของ op บอร์ดงาน — `kanban.<op id>` เช่น `kanban.cards.move` */
export function kanbanKindOf(opId: string): string {
  return `${KIND_PREFIX}${opId}`;
}

export function isKanbanKind(kind: string): boolean {
  return kind.startsWith(KIND_PREFIX) && kanbanToolOps().some((o) => kanbanKindOf(o.id) === kind);
}

/** สิทธิ์ต่อ kind — ดึงจาก `op.action` ตรง ๆ (ห้ามพิมพ์ซ้ำ) */
export function kanbanKindAccess(): Record<string, { module: string; action: string }> {
  const out: Record<string, { module: string; action: string }> = {};
  for (const op of kanbanToolOps()) {
    if (op.kind === "read") continue; // read ไม่เคยกลายเป็นข้อเสนอ
    out[kanbanKindOf(op.id)] = { module: "kanban", action: op.action };
  }
  return out;
}

/** kind ที่ต้องยืนยัน 2 ชั้น = op ชนิด `danger` ทุกตัวที่เปิดเป็น tool */
export function kanbanDestructiveKinds(): string[] {
  return kanbanToolOps().filter((o) => o.kind === "danger").map((o) => kanbanKindOf(o.id));
}

/** scope ที่ต้องมีเพื่อเรียก tool นี้ (= `op.action`) · null = ไม่ใช่ tool ของสกิลบอร์ดงาน */
export function kanbanToolScope(toolName: string): string | null {
  return kanbanToolOps().find((o) => o.tool?.name === toolName)?.action ?? null;
}

/**
 * คีย์ที่มี scope ชุดนี้ เรียก tool ของบอร์ดงานตัวนี้ได้ไหม (WO E2 แบบเดียวกับบัญชี)
 * tool นอกสกิลบอร์ดงาน = ไม่เกี่ยว คืน true · คีย์ `scopes: []` (รุ่นเดิม) = ไม่มีสิทธิ์
 */
export function kanbanToolAllowedForScopes(toolName: string, scopes: string[]): boolean {
  const action = kanbanToolScope(toolName);
  if (action === null) return true;
  return kanbanScopesCan(scopes, action);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. เตรียมคำสั่ง: args ของผู้ช่วย → { op, input, params }
// ─────────────────────────────────────────────────────────────────────────────

type Prepared = {
  op: ApiOp;
  input: unknown;
  params: Record<string, string>;
  args: Record<string, unknown>;
  /** สรุปที่ตัวปรับเขียนเอง (รู้เรื่องมากกว่าตัวสรุปกลาง เช่นชื่อผู้ติดต่อของห้องแชท) */
  summary?: string;
};
type PrepareResult = { ok: true; prepared: Prepared } | { ok: false; error: string };

async function prepareCall(op: ApiOp, rawArgs: unknown, tenantId: string, systemId: string): Promise<PrepareResult> {
  const args = isRecord(rawArgs) ? { ...rawArgs } : {};
  delete args.systemName;
  const adapter = ADAPTERS[op.id];

  if (adapter?.args && adapter.toCall) {
    const parsed = validateWith(adapter.args, args);
    if (!parsed.ok) return { ok: false, error: detailsMessageTh(parsed.details) };
    let call: KanbanToolCall;
    try {
      call = await adapter.toCall(isRecord(parsed.input) ? parsed.input : {}, tenantId, systemId);
    } catch (e) {
      return { ok: false, error: mapError(e).message_th };
    }
    const checked = validateOpInput(op, call.input);
    if (!checked.ok) return { ok: false, error: detailsMessageTh(checked.details) };
    return {
      ok: true,
      prepared: { op, input: checked.input, params: call.params ?? {}, args, ...(call.summary ? { summary: call.summary } : {}) },
    };
  }

  const params: Record<string, string> = {};
  const rest: Record<string, unknown> = {};
  const pathArgs = pathArgsOf(op);
  for (const [k, v] of Object.entries(args)) {
    const hit = pathArgs.find((p) => p.arg === k);
    if (hit) {
      if (typeof v !== "string" || v.trim() === "") return { ok: false, error: `ค่า ${k} ต้องเป็นรหัส (id) ที่ไม่ว่าง` };
      params[hit.param] = v.trim();
      continue;
    }
    rest[k] = v;
  }
  const missing = pathArgs.filter((p) => params[p.param] === undefined).map((p) => p.arg);
  if (missing.length > 0) return { ok: false, error: `ต้องระบุ ${missing.join(", ")} ด้วย` };

  const parsed = validateOpInput(op, rest);
  if (!parsed.ok) return { ok: false, error: detailsMessageTh(parsed.details) };
  return { ok: true, prepared: { op, input: parsed.input, params, args } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ผลลัพธ์ที่ส่งกลับให้โมเดล — ตัดให้สั้นพอคุยรู้เรื่อง (ไทยกิน token ~4 เท่าของอังกฤษ)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ROWS = 20;

function trimResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    const rows = value.slice(0, MAX_ROWS).map(trimResult);
    return value.length > MAX_ROWS ? [...rows, `…แสดง ${MAX_ROWS} จาก ${value.length} รายการ`] : rows;
  }
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue;
    out[k] = trimResult(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. สรุปภาษาไทยของข้อเสนอ (การ์ดยืนยัน — ต้องบอกให้ชัดว่ากำลังจะทำอะไรกับอะไร)
// ─────────────────────────────────────────────────────────────────────────────

async function nameOfBoard(tenantId: string, systemId: string, boardId: unknown): Promise<string | null> {
  if (typeof boardId !== "string" || !boardId) return null;
  const row = await tenantDb({ tenantId, systemId }).kanbanBoard.findFirst({
    where: { id: boardId },
    select: { name: true },
  });
  return row?.name ?? null;
}

async function nameOfCard(tenantId: string, systemId: string, cardId: unknown): Promise<string | null> {
  if (typeof cardId !== "string" || !cardId) return null;
  const row = await tenantDb({ tenantId, systemId }).kanbanCard.findFirst({
    where: { id: cardId },
    select: { title: true, cardNo: true },
  });
  return row ? `${row.cardNo ? `#${row.cardNo} ` : ""}${row.title}` : null;
}

async function summarize(prepared: Prepared, tenantId: string, systemId: string): Promise<string> {
  if (prepared.summary) return prepared.summary;
  const { op, input, params } = prepared;
  const body = isRecord(input) ? input : {};
  const parts: string[] = [op.label];

  const cardName = await nameOfCard(tenantId, systemId, params.id);
  if (cardName && op.path.startsWith("/cards")) parts.push(`การ์ด "${cardName}"`);
  const boardName = await nameOfBoard(tenantId, systemId, params.id);
  if (boardName && op.path.startsWith("/boards")) parts.push(`บอร์ด "${boardName}"`);

  if (typeof body.title === "string") parts.push(`"${body.title}"`);
  if (typeof body.name === "string") parts.push(`"${body.name}"`);
  if (typeof body.body === "string") parts.push(`ข้อความ "${body.body.slice(0, 60)}"`);
  if (typeof body.toColumnId === "string") {
    const col = await tenantDb({ tenantId, systemId }).kanbanColumn.findFirst({
      where: { id: body.toColumnId },
      select: { name: true },
    });
    if (col) parts.push(`ไปคอลัมน์ "${col.name}"`);
  }
  if (Array.isArray(body.userIds)) parts.push(`ผู้รับผิดชอบ ${body.userIds.length} คน`);
  if (typeof body.dueAt === "string") parts.push(`กำหนดส่ง ${thaiDayTime(body.dueAt)}`);
  if (typeof body.reason === "string") parts.push(`เหตุผล: ${body.reason}`);
  return parts.join(" · ");
}

/**
 * ค่าที่ "อ่านออกโดยไม่ต้องแกะซอง" ของข้อเสนอ — path param (เป็นชื่ออาร์กิวเมนต์ เช่น `cardId`)
 * บวกฟิลด์ของ input ระดับบนสุด
 * 🔴 มีไว้ให้จอ/ข้อสอบ/ผู้เรียกภายนอกอ่าน `payload.cardId` ได้ตรง ๆ โดยไม่ต้องรู้โครง `{opId,input,params}`
 *    ตัวที่ใช้ลงมือจริงยังเป็น `input`/`params` เท่านั้น (`dispatchKanbanKind` ตรวจสคีมาซ้ำจากคู่นั้น)
 */
function flatPayload(prepared: Prepared): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { arg, param } of pathArgsOf(prepared.op)) {
    const v = prepared.params[param];
    if (v !== undefined) out[arg] = v;
  }
  if (isRecord(prepared.input)) for (const [k, v] of Object.entries(prepared.input)) out[k] = v;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ทางเข้าหลัก: ผู้ช่วยเรียก tool
// ─────────────────────────────────────────────────────────────────────────────

export type KanbanToolOutcome =
  | { mode: "error"; error: string }
  | { mode: "read"; result: unknown }
  | { mode: "propose"; kind: string; summary: string; payload: Record<string, unknown> };

const NO_SYSTEM = "ร้านนี้ยังไม่ได้เปิดระบบบอร์ดงาน — เปิดระบบบอร์ดงานก่อนแล้วค่อยสั่งอีกครั้ง";
const NO_BOUND_SYSTEM = "ระบบบอร์ดงานที่ระบุใช้กับคีย์นี้ไม่ได้ — ตรวจหัว X-Shark-System หรือระบบที่ผูกกับคีย์";

/**
 * เรียก tool ของสกิลบอร์ดงาน 1 ตัว
 * - read  → รันจริงทันที (actor assistant) แล้วคืนผล
 * - write/danger → **ไม่รัน** คืนข้อมูลสำหรับสร้างข้อเสนอให้เจ้าของกดยืนยัน
 * ไม่โยน error ออกไป (ผู้เรียกเป็น tool ของ LLM) — ทุกทางผิดคืน `{ mode: "error" }` ภาษาไทย
 */
export async function runKanbanTool(
  tenantId: string,
  name: string,
  rawArgs: unknown,
  opts: { systemId?: string } = {},
): Promise<KanbanToolOutcome> {
  const op = kanbanToolOps().find((o) => o.tool?.name === name);
  if (!op) return { mode: "error", error: `ไม่รู้จักเครื่องมือ "${name}"` };

  const systemName = isRecord(rawArgs) && typeof rawArgs.systemName === "string" ? rawArgs.systemName : undefined;
  const system = await findKanbanSystem(tenantId, { systemName, systemId: opts.systemId });
  if (!system) return { mode: "error", error: opts.systemId ? NO_BOUND_SYSTEM : NO_SYSTEM };

  const prep = await prepareCall(op, rawArgs, tenantId, system.id);
  if (!prep.ok) return { mode: "error", error: prep.error };
  const prepared = prep.prepared;

  if (prepared.op.kind !== "read") {
    // 🔴 ผู้ช่วยไม่เคยเขียนเอง — สร้างข้อเสนอให้คนกดยืนยัน (สิทธิ์ตรวจตอนกด ไม่ใช่ตอนนี้)
    const summary = await summarize(prepared, tenantId, system.id);
    return {
      mode: "propose",
      kind: kanbanKindOf(prepared.op.id),
      summary,
      payload: {
        ...flatPayload(prepared),
        opId: prepared.op.id,
        input: prepared.input,
        params: prepared.params,
        systemId: system.id,
      },
    };
  }

  const actor = assistantActor(tenantId, system.id);
  if (!actor.can(prepared.op.action)) return { mode: "error", error: "ผู้ช่วยไม่มีสิทธิ์อ่านข้อมูลส่วนนี้" };
  try {
    const env = await runOpAsActor(prepared.op, actor, {
      input: prepared.input,
      params: prepared.params,
      requestId: `ai-${Date.now().toString(36)}`,
    });
    const body = trimResult(env.data);
    const result = isRecord(body) || Array.isArray(body) ? body : { ผล: body };
    if (env.extra) return { mode: "read", result: { data: result, ...trimResultRecord(env.extra) } };
    return { mode: "read", result };
  } catch (e) {
    return { mode: "error", error: mapError(e).message_th };
  }
}

function trimResultRecord(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) out[k] = trimResult(v);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ลงมือจริงหลังเจ้าของกดยืนยัน (เรียกจาก proposals.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * รัน op ของข้อเสนอ `kanban.*` ด้วยสิทธิ์ของ "คนกดยืนยัน"
 * - อ่าน payload จากแถวข้อเสนอเท่านั้น และ **ตรวจ schema ซ้ำ** (payload เก่าอาจมาจากสัญญาคนละรุ่น)
 * - audit เขียนใน runOpAsActor: actorType USER + after { proposalId, opId }
 * - โยน Error ภาษาไทยเมื่อทำไม่สำเร็จ (proposals.ts แปลงเป็น FAILED + note)
 */
export async function dispatchKanbanKind(
  m: MembershipCtx,
  tenantId: string,
  proposalId: string,
  kind: string,
  rawPayload: unknown,
  userId?: string | null,
): Promise<string> {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const opId = typeof payload.opId === "string" ? payload.opId : kind.slice(KIND_PREFIX.length);
  const op = kanbanToolOps().find((o) => o.id === opId);
  if (!op || op.kind === "read") throw new Error("ไม่รู้จักคำสั่งบอร์ดงานของข้อเสนอนี้");

  const boundSystemId = typeof payload.systemId === "string" ? payload.systemId : undefined;
  const system = await findKanbanSystem(tenantId, { systemId: boundSystemId });
  if (!system) throw new Error(boundSystemId ? NO_BOUND_SYSTEM : NO_SYSTEM);

  const parsed = validateOpInput(op, payload.input);
  if (!parsed.ok) throw new Error(detailsMessageTh(parsed.details));
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(isRecord(payload.params) ? payload.params : {})) {
    if (typeof v === "string") params[k] = v;
  }

  const actor = userActor(tenantId, system.id, m, userId);
  const body = isRecord(parsed.input) ? parsed.input : {};
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  try {
    const env = await runOpAsActor(op, actor, {
      input: parsed.input,
      params,
      requestId: `ai-proposal-${proposalId}`,
      idempotencyKey: `ai-${proposalId}`,
      reason,
      audit: { proposalId, actor: "ai-assistant" },
    });
    return noteOf(op, env.data);
  } catch (e) {
    throw new Error(mapError(e).message_th);
  }
}

/** ข้อความผลลัพธ์ภาษาไทยที่แสดงใต้การ์ดยืนยัน */
function noteOf(op: ApiOp, data: unknown): string {
  const d = isRecord(data) ? data : {};
  const bits: string[] = [];
  if (typeof d.cardNo === "number") bits.push(`การ์ด #${d.cardNo}`);
  if (typeof d.title === "string" && d.title) bits.push(String(d.title));
  if (typeof d.name === "string" && d.name) bits.push(String(d.name));
  if (typeof d.status === "string" && d.status) bits.push(`สถานะ ${d.status}`);
  return bits.length > 0 ? `${op.label}เรียบร้อยแล้ว — ${bits.join(" · ")}` : `${op.label}เรียบร้อยแล้ว`;
}
