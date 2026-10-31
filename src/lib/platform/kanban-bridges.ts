// kanban-bridges.ts — "การ์ดเกิดจากที่อื่น" (K3.3 · พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.2)
//
// 🔴 ทำไมไฟล์นี้อยู่ที่ `src/lib/platform/` ไม่ใช่ในโมดูลบอร์ดงาน:
//    งานของไฟล์นี้คือ "อ่านของจริงจากโมดูลต้นทาง (ฟอร์ม/อนุมัติ/บัญชี/บุคคล/ขายหน้าร้าน/แชท)
//    แล้วขอให้บอร์ดงานเปิดการ์ดให้" ⇒ ถ้าเขียนไว้ในโมดูล kanban จะกลายเป็นเส้น import
//    `kanban→forms/hr/pos/chat/...` ซึ่งผิดกติกา "ทิศทางเดียว" ของ run นี้ (fitness F2 เฝ้าอยู่)
//    composition root อ่านได้ทุกโมดูล ⇒ สะพานทุกใบมาอยู่ที่นี่ที่เดียว
//
// 🔴 กติกาที่ถือไว้ทั้งไฟล์
//  1. **สวิตช์มาก่อนเสมอ** — ทุก handler บรรทัดแรกคือ `integrationsFor()` (สวิตช์รายร้านของระบบ KANBAN)
//     ปิดอยู่ = `return` ทันที **ก่อนอ่านฐานข้อมูลอื่นใด** · ร้านที่ไม่ได้เปิดต้องไม่จ่ายค่าคิวรีแม้แต่นัดเดียว
//     และที่สำคัญกว่านั้น: ต้องไม่มีการ์ดงอกในบอร์ดของร้านที่ไม่เคยขอ (มติ D6)
//  2. **ยิงซ้ำได้เสมอ** — คิว outbox retry ได้ / consumer สองตัวแข่งกันได้ ⇒ ทุกใบผูก `sourceKey`
//     แล้วปล่อยให้ประตู `links.createCardFromExternal` กันซ้ำให้ (อ่านก่อน + unique ของ DB)
//     ส่วนความเห็น/การย้าย กันซ้ำเองด้วย "มีอยู่แล้วไหม" ก่อนเขียนทุกครั้ง
//  3. **เขียนบอร์ดงานผ่านประตูของโมดูลเท่านั้น** — `links.createCardFromExternal` (การ์ดใหม่) และ
//     `moves.moveCard` (ย้ายเข้าคอลัมน์เสร็จ) · ห้ามเรียก `kanban/service` ตรง
//  4. **ห้ามแตะตาราง Account\*** (§9.3) — สะพานเอกสารบัญชีอ่านได้แค่ "เลขที่" ที่การ์ดจดไว้ตอนผูกลิงก์
//     ปิดการ์ดคือขาเข้า ไม่ใช่ขาออก: สถานะเอกสารเป็นของโมดูลบัญชี ที่นี่ไม่แก้
//  5. **พังต้องเงียบ** — ผู้เรียกคือ consumer ของคิวกลาง (`outbox-consumers.ts` ห่อ try/catch ให้อีกชั้น)
//     สะพานล้ม ห้ามพา event หลักล้มตาม ไม่งั้นคิวทั้งระบบตันเพราะฟีเจอร์เสริมใบเดียว
//  6. **วันไทยคิดเองที่ +07:00** — ห้าม `getDay()`/`getDate()` บนเวลา UTC (`reference_thai_date_getday_trap`)
//  7. ข้อความที่คนนอกพิมพ์ (คำตอบในฟอร์ม · ข้อความแชท) ถูก escape ก่อนประกอบเป็น HTML ของรายละเอียดการ์ด

import { prisma } from "@/lib/core/db";
import { entityLabel, statusLabel } from "@/lib/modules/approval/labels";
import { getIntegrations, type KanbanIntegrations } from "@/lib/modules/kanban/integrations";
import { createCardFromExternal } from "@/lib/modules/kanban/links";
import { moveCard } from "@/lib/modules/kanban/moves";
import type { KanbanActor, KanbanCtx, KanbanLinkKind, KanbanLinkRole } from "@/lib/modules/kanban/types";

/** รูปของ event ที่ consumer ส่งเข้ามา (ตรงกับ `OutboxHandler` ของ `core/outbox`) */
export type BridgeEvent = {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  systemId: string | null;
  unitId: string | null;
};

/** ระบบบอร์ดงาน 1 ใบของร้าน + ค่าสวิตช์ของมัน (ร้านหนึ่งเปิดบอร์ดงานได้หลายระบบ — D1) */
type KanbanTarget = { systemId: string; integrations: KanbanIntegrations };

/**
 * actor ของ "ระบบ" สำหรับ `moves.moveCard` — service เดิมของโมดูลบังคับด่านบทบาทบอร์ดทุกครั้ง
 * แต่การย้ายรอบนี้ไม่มีคนกด ⇒ ใช้รูปเดียวกับ `automation.ts#SYSTEM_ACTOR` (apiRole = ADMIN)
 * 🔴 `actorUserId` ยังเป็น `null` เสมอ ⇒ ประวัติกิจกรรมขึ้นว่า "ระบบทำ" ไม่ใช่สวมชื่อใครสักคน
 */
const SYSTEM_ACTOR: KanbanActor = { userId: "", role: "OWNER", unitAccess: ["*"], permissions: {}, apiRole: "ADMIN" };

const systemCtx = (tenantId: string, systemId: string): KanbanCtx => ({ tenantId, systemId, actorUserId: null });
const moveCtx = (tenantId: string, systemId: string): KanbanCtx => ({ tenantId, systemId, actorUserId: null, actor: SYSTEM_ACTOR });

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "3 ต.ค." ของวันไทย (คิดที่ +07:00 เอง — เซิร์ฟเวอร์เป็น UTC) */
function bkkDayLabel(d: Date): string {
  const b = new Date(d.getTime() + BKK_OFFSET_MS);
  return `${b.getUTCDate()} ${THAI_MONTH[b.getUTCMonth()] ?? ""}`.trim();
}

/** 09:00 ตามเวลาไทยของ "วันไทยของ d บวก addDays" — ใช้ตั้งกำหนดส่ง "วันก่อนเริ่มลา" */
function bkkMorning(d: Date, addDays: number): Date {
  const b = new Date(d.getTime() + BKK_OFFSET_MS);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + addDays, 9, 0, 0) - BKK_OFFSET_MS);
}

/** สตางค์ → "25,000" (ผู้อ่านคือเจ้าของร้าน — ตัวเลขต้องอ่านออกทันที ไม่ใช่หน่วยของโปรแกรมเมอร์) */
function baht(satang: number): string {
  return (satang / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** ค่าสตริงจาก payload ของ event (ไม่มี/ผิดชนิด = null — payload มาจากคิว ไม่ใช่ของที่เราคุมรูป) */
function str(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v : null;
}

/** escape ก่อนประกอบเป็น HTML — ข้อความพวกนี้คนนอกร้านเป็นคนพิมพ์ (ฟอร์มสาธารณะ/แชทลูกค้า) */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * สวิตช์ "การเชื่อมต่อ" ของ **ทุกระบบบอร์ดงาน** ในร้านนี้ — อ่านสดทุกครั้ง (ไม่ cache)
 * 🔴 ตัวนี้คือด่านแรกของทุกสะพาน: ไม่มีระบบบอร์ดงาน/ปิดสวิตช์ = จบตั้งแต่ที่นี่
 */
async function integrationsFor(tenantId: string): Promise<KanbanTarget[]> {
  const systems = await prisma.appSystem.findMany({
    where: { tenantId, type: "KANBAN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const out: KanbanTarget[] = [];
  for (const s of systems) out.push({ systemId: s.id, integrations: await getIntegrations(tenantId, s.id) });
  return out;
}

/** ระบบบอร์ดงานทุกใบของทุกร้านที่เปิด "เปิดการ์ดเมื่อลูกค้ารอนาน" ไว้ (ตัวกวาดรายชั่วโมงใช้) */
async function integrationsForChatSweep(): Promise<{ tenantId: string; systemId: string; boardId: string; columnId: string | null; minutes: number }[]> {
  const systems = await prisma.appSystem.findMany({
    where: { type: "KANBAN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true },
  });
  const out: { tenantId: string; systemId: string; boardId: string; columnId: string | null; minutes: number }[] = [];
  for (const s of systems) {
    const cfg = (await getIntegrations(s.tenantId, s.id)).openTaskFromChat;
    if (!cfg.enabled || !cfg.boardId || !cfg.unassignedMinutes || cfg.unassignedMinutes <= 0) continue;
    out.push({ tenantId: s.tenantId, systemId: s.id, boardId: cfg.boardId, columnId: cfg.columnId, minutes: cfg.unassignedMinutes });
  }
  return out;
}

/** คอลัมน์ "เสร็จ" ใบแรกของบอร์ด (ไม่มี = บอร์ดนี้ยังไม่ได้ตั้งคอลัมน์เสร็จ → คงการ์ดไว้ที่เดิม) */
async function firstDoneColumnId(tenantId: string, systemId: string, boardId: string): Promise<string | null> {
  const col = await prisma.kanbanColumn.findFirst({
    where: { boardId, tenantId, systemId, status: "ACTIVE", isDoneColumn: true },
    orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    select: { id: true },
  });
  return col?.id ?? null;
}

/**
 * ความเห็นของ "ระบบ" ในการ์ด — เขียนแถวตรง เพราะ `comments.addComment` บังคับว่าผู้เขียนต้องเป็นคน
 * ที่ล็อกอินอยู่และเป็น EDITOR ของบอร์ด (สะพานไม่มีคน) · ลงชื่อผู้สร้างการ์ด แล้วตกไปที่เจ้าของร้าน
 * 🔴 กันซ้ำด้วย "ข้อความเดิมมีอยู่แล้วไหม" — event ยิงซ้ำ 3 ครั้งต้องได้ความเห็นใบเดียว
 * 🔴 ไม่ยิง outbox `kanban.comment.added` โดยตั้งใจ (เหมือนความเห็นของกฎอัตโนมัติ) — ไม่งั้นกฎที่ฟัง
 *    "มีความเห็นใหม่" จะวิ่งเพราะระบบพูดกับตัวเอง
 */
async function systemComment(
  tenantId: string,
  card: { id: string; boardId: string; createdById: string | null },
  body: string,
): Promise<boolean> {
  const dup = await prisma.kanbanComment.findFirst({ where: { cardId: card.id, body }, select: { id: true } });
  if (dup) return false;
  const authorUserId = card.createdById ?? (await fallbackOwnerId(tenantId));
  if (!authorUserId) return false; // ร้านไม่มีเจ้าของให้ลงชื่อ = ข้ามเงียบ (ห้ามพา consumer ล้ม)
  await prisma.$transaction(async (tx) => {
    const row = await tx.kanbanComment.create({
      data: { tenantId, cardId: card.id, authorUserId, body, mentions: [] },
    });
    await tx.kanbanActivity.create({
      data: { tenantId, boardId: card.boardId, cardId: card.id, actorUserId: null, type: "COMMENT_ADDED", data: { commentId: row.id, bridge: true } },
    });
  });
  return true;
}

/** เจ้าของร้านคนแรก — ใช้ลงชื่อความเห็นของระบบเมื่อการ์ดไม่มีผู้สร้าง (การ์ดที่เกิดจากคิว) */
async function fallbackOwnerId(tenantId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { tenantId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return m?.userId ?? null;
}

/** ปิดการ์ด 1 ใบ: ย้ายเข้าคอลัมน์เสร็จใบแรกของบอร์ดตัวเอง (ไม่มีคอลัมน์เสร็จ = ไม่ย้าย ไม่ throw) */
async function closeCard(tenantId: string, systemId: string, card: { id: string; boardId: string }): Promise<void> {
  const doneColumnId = await firstDoneColumnId(tenantId, systemId, card.boardId);
  if (!doneColumnId) return;
  await moveCard(moveCtx(tenantId, systemId), { cardId: card.id, toColumnId: doneColumnId, force: true });
}

/** การ์ดที่เคยเกิดจากกุญแจนี้ (ขอบเขต = ร้าน ตรงกับ unique partial index ของ DB) */
async function cardBySourceKey(
  tenantId: string,
  sourceKey: string,
): Promise<{ id: string; boardId: string; systemId: string; columnId: string; createdById: string | null; completedAt: Date | null; status: string } | null> {
  return prisma.kanbanCard.findFirst({
    where: { tenantId, sourceKey },
    select: { id: true, boardId: true, systemId: true, columnId: true, createdById: true, completedAt: true, status: true },
  });
}

/** ผู้ใช้คนนี้ยังอยู่ในร้านไหม — มอบหมายคนที่ไม่มี Membership แล้ว service จะโยน (การ์ดต้องเกิดให้ได้ก่อน) */
async function memberExists(tenantId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await prisma.membership.findFirst({ where: { tenantId, userId }, select: { userId: true } });
  return m !== null;
}

/**
 * ผู้จัดการที่ดูแล "สาขาของงานนี้" คนแรก — ใช้มอบหมายการ์ดหาคนแทนตอนมีใบลา
 * สาขาที่ถือว่าเกี่ยวข้อง = สาขาที่ระบบบุคคลใบนั้นผูกไว้ (`AppSystemUnit`) · ไม่มีผูกไว้ → ใช้สาขาของบอร์ดปลายทาง
 * (ไม่มีใครเข้าเงื่อนไข = ไม่มอบหมาย ดีกว่าโยนงานให้คนที่ไม่เกี่ยว)
 */
async function managerOfUnits(tenantId: string, unitIds: string[]): Promise<string | null> {
  const units = unitIds.filter(Boolean);
  if (units.length === 0) return null;
  const rows = await prisma.membership.findMany({
    where: { tenantId, role: "MANAGER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true, unitAccess: true },
  });
  for (const r of rows) {
    const access = Array.isArray(r.unitAccess) ? (r.unitAccess as unknown[]).map(String) : [];
    if (access.includes("*") || units.some((u) => access.includes(u))) return r.userId;
  }
  return null;
}

/** สาขาที่ระบบใบหนึ่งผูกไว้ (ใช้หาผู้จัดการของระบบบุคคลที่ยิง event เข้ามา) */
async function unitIdsOfSystem(systemId: string | null): Promise<string[]> {
  if (!systemId) return [];
  const rows = await prisma.appSystemUnit.findMany({ where: { systemId }, select: { unitId: true } });
  return rows.map((r) => r.unitId);
}

/** สาขาของบอร์ดปลายทาง (บอร์ดกลางองค์กรไม่มีสาขา → []) */
async function unitIdsOfBoard(tenantId: string, boardId: string): Promise<string[]> {
  const b = await prisma.kanbanBoard.findFirst({ where: { id: boardId, tenantId }, select: { unitId: true } });
  return b?.unitId ? [b.unitId] : [];
}

/** รายการคำตอบของฟอร์ม → `<ul><li>ป้าย: ค่า</li>…</ul>` (escape ทุกช่อง — ฟอร์มเป็นของสาธารณะ) */
function answersToHtml(fields: unknown, answers: unknown): string {
  const answerMap: Record<string, unknown> = answers && typeof answers === "object" && !Array.isArray(answers) ? (answers as Record<string, unknown>) : {};
  const defs = Array.isArray(fields) ? fields : [];
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    if (!def || typeof def !== "object") continue;
    const d = def as Record<string, unknown>;
    const key = typeof d.key === "string" ? d.key : "";
    if (!key) continue;
    seen.add(key);
    const label = typeof d.label === "string" && d.label.trim() ? d.label : key;
    rows.push(`<li>${esc(label)}: ${esc(valueText(answerMap[key]))}</li>`);
  }
  // ช่องที่ผู้กรอกส่งมาแต่ไม่มีในนิยามฟอร์มแล้ว (ฟอร์มถูกแก้ทีหลัง) — ยังต้องเห็น ไม่ใช่หายเงียบ
  for (const [key, value] of Object.entries(answerMap)) {
    if (seen.has(key)) continue;
    rows.push(`<li>${esc(key)}: ${esc(valueText(value))}</li>`);
  }
  return rows.length > 0 ? `<ul>${rows.join("")}</ul>` : "";
}

function valueText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map((x) => valueText(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v).trim();
  return s || "—";
}

/** ชื่อผู้กรอกฟอร์ม — เดาจากช่องที่ "หมายถึงชื่อคน" (ไม่เจอ = ไม่ระบุชื่อ ไม่ใช่เดามั่ว) */
function submitterName(fields: unknown, answers: unknown): string {
  const answerMap: Record<string, unknown> = answers && typeof answers === "object" && !Array.isArray(answers) ? (answers as Record<string, unknown>) : {};
  const defs = Array.isArray(fields) ? fields : [];
  for (const def of defs) {
    if (!def || typeof def !== "object") continue;
    const d = def as Record<string, unknown>;
    const key = typeof d.key === "string" ? d.key : "";
    const label = typeof d.label === "string" ? d.label : "";
    if (!key) continue;
    if (/^(name|fullname|full_name|customer|contact|ชื่อ)/i.test(key) || /ชื่อ/.test(label)) {
      const t = valueText(answerMap[key]);
      if (t && t !== "—") return t;
    }
  }
  return "ไม่ระบุชื่อ";
}

const LEAVE_TYPE_LABEL: Record<string, string> = { SICK: "ป่วย", PERSONAL: "กิจ", VACATION: "พักร้อน", OTHER: "อื่น ๆ" };

type BridgeLink = { linkType: KanbanLinkKind; linkId: string; role?: KanbanLinkRole | null; label?: string | null };

// ═══════════════════════════ สะพานขาเข้า (event → การ์ด) ═══════════════════════════

/**
 * ฟอร์มถูกส่ง → การ์ด "ฟอร์ม: {ชื่อฟอร์ม} — {ชื่อผู้กรอก}" พร้อมคำตอบทุกข้อในรายละเอียด
 * 🔴 ลูกค้ากรอกฟอร์มแล้วไม่มีใครเห็น = งานหาย ⇒ การ์ดต้องลงบอร์ดที่ทีมเปิดอยู่จริง ไม่ใช่กล่องอีเมลใครคนหนึ่ง
 */
export async function onFormSubmission(evt: BridgeEvent): Promise<void> {
  const target = (await integrationsFor(evt.tenantId)).find((t) => t.integrations.cardFromForm.enabled && t.integrations.cardFromForm.boardId);
  if (!target) return;
  const cfg = target.integrations.cardFromForm;
  const submissionId = str(evt.payload, "submissionId");
  if (!submissionId || !cfg.boardId) return;

  const sub = await prisma.formSubmission.findFirst({
    where: { id: submissionId, tenantId: evt.tenantId },
    select: { id: true, answersJson: true, form: { select: { name: true, fieldsJson: true } } },
  });
  if (!sub) return;

  const who = submitterName(sub.form.fieldsJson, sub.answersJson);
  await createCardFromExternal(systemCtx(evt.tenantId, target.systemId), {
    boardId: cfg.boardId,
    columnId: cfg.columnId,
    title: `ฟอร์ม: ${sub.form.name} — ${who}`,
    description: answersToHtml(sub.form.fieldsJson, sub.answersJson),
    sourceType: "FORM",
    sourceKey: `form:${sub.id}`,
    links: [{ linkType: "FORM_SUBMISSION", linkId: sub.id, role: "SOURCE" } satisfies BridgeLink],
  });
}

/**
 * มีคำขออนุมัติใหม่ → การ์ดติดตามให้ **ผู้ยื่น** (คนที่ต้องคอยตาม ไม่ใช่ผู้อนุมัติ — ผู้อนุมัติมีหน้า
 * "รออนุมัติของฉัน" ของตัวเองอยู่แล้ว · คนที่ของค้างคือคนที่ยื่นแล้วเงียบหาย)
 */
export async function onApprovalSubmitted(evt: BridgeEvent): Promise<void> {
  const target = (await integrationsFor(evt.tenantId)).find((t) => t.integrations.cardFromApproval.enabled && t.integrations.cardFromApproval.boardId);
  if (!target) return;
  const boardId = target.integrations.cardFromApproval.boardId;
  const requestId = str(evt.payload, "requestId");
  if (!requestId || !boardId) return;

  const req = await prisma.approvalRequest.findFirst({
    where: { id: requestId, tenantId: evt.tenantId },
    select: { id: true, entityType: true, amountSatang: true, requestedById: true },
  });
  if (!req) return;

  const amount = req.amountSatang !== null ? ` ฿${baht(req.amountSatang)}` : "";
  const assignee = (await memberExists(evt.tenantId, req.requestedById)) ? [req.requestedById] : [];
  await createCardFromExternal(systemCtx(evt.tenantId, target.systemId), {
    boardId,
    title: `คำขออนุมัติ: ${entityLabel(req.entityType)}${amount}`,
    assigneeUserIds: assignee,
    sourceType: "AUTOMATION",
    sourceKey: `approval:${req.id}`,
    links: [{ linkType: "APPROVAL_REQUEST", linkId: req.id, role: "SOURCE" } satisfies BridgeLink],
  });
}

/**
 * คำขอถูกอนุมัติ/ปฏิเสธ → ไม่สร้างการ์ดใหม่ · ไปบอกผลที่การ์ดติดตามใบเดิม (ไม่มีการ์ด = ไม่ทำอะไร)
 * ผ่าน → ปิดงานให้เลย (ย้ายเข้าคอลัมน์เสร็จ) เพราะเรื่องที่ต้องตามจบแล้วจริง ๆ
 */
export async function onApprovalDecided(evt: BridgeEvent): Promise<void> {
  const target = (await integrationsFor(evt.tenantId)).find((t) => t.integrations.cardFromApproval.enabled);
  if (!target) return;
  const requestId = str(evt.payload, "requestId");
  if (!requestId) return;
  const approved = evt.type === "approval.request.approved";

  const card = await cardBySourceKey(evt.tenantId, `approval:${requestId}`);
  if (!card || card.status !== "ACTIVE") return;

  await systemComment(evt.tenantId, card, `ผลอนุมัติ: ${statusLabel(approved ? "APPROVED" : "REJECTED")}`);
  if (approved && card.completedAt === null) await closeCard(evt.tenantId, card.systemId, card);
}

/**
 * เอกสารบัญชีถูกอนุมัติ/จ่ายครบ → ปิดการ์ดที่ผูกเอกสารใบนั้นไว้
 * 🔴 ทิศทางเดียว: อ่านแค่ `documentId` ที่มากับ event แล้วไปหา "การ์ดที่ผูกไว้" — **ไม่แตะตาราง Account\***
 *    (สถานะเอกสารเป็นของโมดูลบัญชี · ที่นี่เป็นขาเข้าอย่างเดียวตาม §9.3)
 */
export async function onAccountDocSettled(evt: BridgeEvent): Promise<void> {
  const targets = (await integrationsFor(evt.tenantId)).filter((t) => t.integrations.closeCardOnDocApproved.enabled);
  if (targets.length === 0) return;
  const documentId = str(evt.payload, "documentId");
  if (!documentId) return;
  const verb = evt.type === "account.invoice.paid" ? "จ่ายแล้ว" : "อนุมัติแล้ว";

  const links = await prisma.kanbanCardLink.findMany({
    where: {
      tenantId: evt.tenantId,
      systemId: { in: targets.map((t) => t.systemId) },
      linkType: "ACCOUNT_DOC",
      linkId: documentId,
      removedAt: null,
    },
    select: { cardId: true, label: true, systemId: true },
  });

  for (const link of links) {
    const card = await prisma.kanbanCard.findFirst({
      where: { id: link.cardId, tenantId: evt.tenantId, status: "ACTIVE", completedAt: null },
      select: { id: true, boardId: true, systemId: true, createdById: true },
    });
    if (!card) continue;
    await systemComment(evt.tenantId, card, `เอกสาร ${link.label ?? documentId} ${verb} — ปิดงานอัตโนมัติ`);
    await closeCard(evt.tenantId, card.systemId, card);
  }
}

/**
 * พนักงานยื่นใบลา → การ์ด "หาคนแทน" ให้หัวหน้าสาขา กำหนดส่ง 09:00 ของ **วันก่อนเริ่มลา**
 * (ตั้งกำหนดส่งเป็นวันเริ่มลา = สายไปแล้ว — คนแทนต้องถูกจัดก่อนถึงวันนั้น)
 */
export async function onLeaveSubmitted(evt: BridgeEvent): Promise<void> {
  const target = (await integrationsFor(evt.tenantId)).find((t) => t.integrations.cardOnLeave.enabled && t.integrations.cardOnLeave.boardId);
  if (!target) return;
  const boardId = target.integrations.cardOnLeave.boardId;
  const leaveId = str(evt.payload, "leaveId");
  if (!leaveId || !boardId) return;

  const leave = await prisma.hrLeave.findFirst({
    where: { id: leaveId, tenantId: evt.tenantId },
    select: { id: true, type: true, fromDate: true, toDate: true, employee: { select: { name: true } } },
  });
  if (!leave) return;

  const kind = LEAVE_TYPE_LABEL[leave.type] ?? "อื่น ๆ";
  const units = await unitIdsOfSystem(evt.systemId);
  const managerId = await managerOfUnits(evt.tenantId, units.length > 0 ? units : await unitIdsOfBoard(evt.tenantId, boardId));

  await createCardFromExternal(systemCtx(evt.tenantId, target.systemId), {
    boardId,
    title: `หาคนแทน: ${leave.employee.name} ลา${kind} ${bkkDayLabel(leave.fromDate)}–${bkkDayLabel(leave.toDate)}`,
    dueAt: bkkMorning(leave.fromDate, -1),
    assigneeUserIds: managerId ? [managerId] : [],
    sourceType: "AUTOMATION",
    sourceKey: `hrleave:${leave.id}`,
    links: [{ linkType: "HR_LEAVE", linkId: leave.id, role: "SOURCE" } satisfies BridgeLink],
  });
}

/**
 * บิลถูกยกเลิก → การ์ดตรวจสอบย้อนหลัง เฉพาะบิลที่ยอด ≥ "ยอดขั้นต่ำ" ที่ร้านตั้งไว้
 * (ยกเลิกบิล 20 บาทเพราะกดผิดเป็นเรื่องปกติหน้าร้าน — เปิดการ์ดทุกใบ = บอร์ดกลายเป็นขยะ ไม่มีใครอ่าน)
 */
export async function onVoidedSale(evt: BridgeEvent): Promise<void> {
  const target = (await integrationsFor(evt.tenantId)).find((t) => t.integrations.cardOnVoidedSale.enabled && t.integrations.cardOnVoidedSale.boardId);
  if (!target) return;
  const cfg = target.integrations.cardOnVoidedSale;
  const saleId = str(evt.payload, "saleId");
  if (!saleId || !cfg.boardId) return;

  const sale = await prisma.posSale.findFirst({
    where: { id: saleId, tenantId: evt.tenantId },
    select: { id: true, receiptNo: true, grandTotalSatang: true },
  });
  if (!sale) return;
  if (sale.grandTotalSatang < (cfg.minSatang ?? 0)) return;

  await createCardFromExternal(systemCtx(evt.tenantId, target.systemId), {
    boardId: cfg.boardId,
    title: `ตรวจสอบบิลยกเลิก ${sale.receiptNo ?? sale.id} ฿${baht(sale.grandTotalSatang)}`,
    sourceType: "AUTOMATION",
    sourceKey: `possale:${sale.id}`,
    links: [{ linkType: "POS_SALE", linkId: sale.id, role: "SOURCE" } satisfies BridgeLink],
  });
}

/**
 * ตัวกวาดรายชั่วโมง: ห้องแชทที่ลูกค้าทักแล้ว "ไม่มีใครรับ" เกิน N นาที → การ์ด "ลูกค้ารอคำตอบ"
 *
 * 🔴 ทำไมเป็น sweep ไม่ใช่ consumer ของ `chat.message.received`: เงื่อนไขคือ **เวลาผ่านไปแล้วยังไม่มีใครรับ**
 *    ซึ่งเป็นเหตุการณ์ที่ "ไม่มีใครยิง" — ตอนข้อความเข้ามายังไม่ผิดอะไร ⇒ ต้องมีคนเดินมาดูเป็นรอบ ๆ
 * คืนจำนวน **การ์ดที่เกิดใหม่จริง** (ไม่ใช่จำนวนห้องที่ตรวจ) — รันซ้ำในชั่วโมงเดียวกันต้องได้ 0
 */
export async function sweepUnattendedChats(now: Date): Promise<number> {
  const targets = await integrationsForChatSweep();
  if (targets.length === 0) return 0;
  let created = 0;

  for (const t of targets) {
    const cutoff = new Date(now.getTime() - t.minutes * 60_000);
    const convs = await prisma.chatConversation.findMany({
      where: {
        tenantId: t.tenantId,
        status: "OPEN",
        assigneeUserId: null,
        lastMessageDirection: "IN",
        lastMessageAt: { lte: cutoff },
      },
      orderBy: { lastMessageAt: "asc" },
      take: 200,
      select: { id: true, contact: { select: { displayName: true } } },
    });

    for (const conv of convs) {
      const msg = await prisma.chatMessage.findFirst({
        where: { tenantId: t.tenantId, conversationId: conv.id, direction: "IN" },
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true },
      });
      if (!msg) continue;
      const who = conv.contact?.displayName?.trim() || "ลูกค้า";
      const preview = (msg.body ?? "").trim().slice(0, 200);
      try {
        const res = await createCardFromExternal(systemCtx(t.tenantId, t.systemId), {
          boardId: t.boardId,
          columnId: t.columnId,
          title: `ลูกค้ารอคำตอบ: ${who}`,
          description: preview ? `<p>${esc(preview)}</p>` : null,
          sourceType: "CHAT",
          sourceKey: `chat:${msg.id}`,
          links: [{ linkType: "CHAT_CONVERSATION", linkId: conv.id, role: "SOURCE" } satisfies BridgeLink],
        });
        if (res.created) created++;
      } catch {
        // ห้องเดียวเปิดการ์ดไม่ได้ (บอร์ดถูกเก็บ/คอลัมน์หาย) ไม่ใช่เหตุให้ทั้งรอบล้ม — ไปห้องถัดไป
      }
    }
  }
  return created;
}

// ═══════════════════════════ SVC D.16 ▸ แจ้งซ่อมหอ → การ์ดบอร์ดงาน ═══════════════════════════
// ใบสั่ง ledger/svc-briefs/svc-brief-d.16.md §4 (มติผู้คุม R5 · R6) — บล็อกนี้ของใบ D.16 เท่านั้น
//  • สวิตช์ = ร้านมีระบบบอร์ดงานที่ active + มีบอร์ดชื่อตรงกับหมวดแจ้งซ่อม (#59 `board`) · ไม่มีบอร์ดชื่อนั้น ⇒ ไม่สร้างการ์ด
//    (ไม่ตกไปบอร์ดอื่น — ต่างจาก D.6 โดยตั้งใจ · ตัวกวาดเติมให้เมื่อตั้งบอร์ดแล้ว) · ไม่เพิ่มคีย์ใน KanbanIntegrations
//  • การ์ด 1 ใบต่อคำแจ้ง: sourceKey `dorm.repair#<id>` ผ่านประตู createCardFromExternal (unique ของ DB) + ผูกกลับด้วย CAS ของ facade หอ
//  • เขียนคำแจ้งผ่าน facade หอเท่านั้น (linkRepairCard · applyRepairCardState) · ไม่แนบไฟล์ (รูปผู้เช่าเป็นไฟล์ส่วนตัว)
//  • การ์ด: ห้อง · หมวด · ข้อความ (escape) · ป้ายเข้าห้อง · เวลาสะดวก · เลขงาน · ทางเข้าจอช่าง — ไม่มีชื่อ/เบอร์ผู้เช่า
//  • DONE เป็นสถานะจบ (R6): เปิดการ์ดใหม่/ปิดซ้ำไม่เปลี่ยนคำแจ้ง
const REPAIR_CARD_PREFIX = "dorm.repair#";
const REPAIR_CARD_WINDOW_MS = 14 * 86_400_000;
type RepairCardSrc = {
  id: string;
  tenantId: string;
  unitId: string;
  roomId: string;
  category: string;
  text: string;
  allowEntry: boolean;
  preferredTime: string | null;
  status: string;
  kanbanCardId: string | null;
  createdAt: Date;
};
type RepairCategory = { code: string; labelTh: string; board: string; assigneeId: string | null };
type RepairBoard = { boardId: string; systemId: string; columnId: string } | null;
type RepairCardCache = { cats: Map<string, RepairCategory[]>; boards: Map<string, RepairBoard>; slugs: Map<string, string> };
const repairCardCache = (): RepairCardCache => ({ cats: new Map(), boards: new Map(), slugs: new Map() });
const dormRepairFacade = () => import("@/lib/modules/dorm");
const REPAIR_SRC_SELECT = {
  id: true,
  tenantId: true,
  unitId: true,
  roomId: true,
  category: true,
  text: true,
  allowEntry: true,
  preferredTime: true,
  status: true,
  kanbanCardId: true,
  createdAt: true,
} as const;

/** หมวดแจ้งซ่อมของหน่วย (#59 · ค่าเริ่มจากทะเบียน) — แคชในรอบ */
async function repairCategories(tenantId: string, unitId: string, cache: RepairCardCache): Promise<RepairCategory[]> {
  const k = `${tenantId}\u0000${unitId}`;
  const hit = cache.cats.get(k);
  if (hit) return hit;
  const { resolveSettings } = await import("@/lib/core/settings");
  const v = (await resolveSettings({ tenantId }, ["rooms.repair.categories"], { unitId }))["rooms.repair.categories"]?.value;
  const out: RepairCategory[] = [];
  if (Array.isArray(v)) {
    for (const x of v) {
      if (!x || typeof x !== "object") continue;
      const o = x as Record<string, unknown>;
      if (typeof o.code !== "string" || typeof o.labelTh !== "string" || typeof o.board !== "string" || !o.board) continue;
      out.push({ code: o.code, labelTh: o.labelTh, board: o.board, assigneeId: typeof o.assigneeId === "string" && o.assigneeId ? o.assigneeId : null });
    }
  }
  cache.cats.set(k, out);
  return out;
}

/** บอร์ดของหมวด = บอร์ด ACTIVE ชื่อตรงตัว เก่าสุดในทุกระบบบอร์ดงานที่ active ของร้าน + คอลัมน์แรก · ไม่มี ⇒ null — แคชในรอบ */
async function repairBoardFor(tenantId: string, name: string, cache: RepairCardCache): Promise<RepairBoard> {
  const k = `${tenantId}\u0000${name}`;
  if (cache.boards.has(k)) return cache.boards.get(k) ?? null;
  let out: RepairBoard = null;
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "KANBAN", active: true }, select: { id: true } });
  if (systems.length) {
    const board = await prisma.kanbanBoard.findFirst({
      where: { tenantId, name, status: "ACTIVE", systemId: { in: systems.map((s) => s.id) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, systemId: true },
    });
    if (board) {
      const col = await prisma.kanbanColumn.findFirst({
        where: { boardId: board.id, tenantId, systemId: board.systemId, status: "ACTIVE" },
        orderBy: [{ position: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
        select: { id: true },
      });
      if (col) out = { boardId: board.id, systemId: board.systemId, columnId: col.id };
    }
  }
  cache.boards.set(k, out);
  return out;
}

async function repairUnitSlug(tenantId: string, unitId: string, cache: RepairCardCache): Promise<string> {
  const k = `${tenantId}\u0000${unitId}`;
  const hit = cache.slugs.get(k);
  if (hit !== undefined) return hit;
  const u = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { slug: true } });
  const slug = u?.slug ?? "";
  cache.slugs.set(k, slug);
  return slug;
}

/** เปิดการ์ดของคำแจ้ง 1 รายการ (ไม่มีบอร์ดตามหมวด ⇒ false) แล้วผูกกลับ · คืน true เมื่อการ์ดเกิดใหม่จริง */
async function openRepairCard(r: RepairCardSrc, cache: RepairCardCache): Promise<boolean> {
  if (r.status !== "OPEN" && r.status !== "IN_PROGRESS") return false;
  const cat = (await repairCategories(r.tenantId, r.unitId, cache)).find((c) => c.code === r.category);
  if (!cat) return false;
  const board = await repairBoardFor(r.tenantId, cat.board, cache);
  if (!board) return false;
  const room = await prisma.hotelRoom.findFirst({ where: { id: r.roomId, tenantId: r.tenantId }, select: { number: true } });
  const slug = await repairUnitSlug(r.tenantId, r.unitId, cache);
  const assignee =
    cat.assigneeId && (await prisma.membership.findFirst({ where: { tenantId: r.tenantId, userId: cat.assigneeId, acceptedAt: { not: null } }, select: { userId: true } }))
      ? [cat.assigneeId]
      : [];
  const oneLine = r.text.replace(/\s+/g, " ").trim();
  const short = Array.from(oneLine).length > 60 ? `${Array.from(oneLine).slice(0, 59).join("")}…` : oneLine;
  const roomNo = room?.number ?? "-";
  const ticketNo = `R-${r.id.slice(-6).toUpperCase()}`;
  const jobPath = `/app/u/${slug}/dorm/repairs/${r.id}`;
  const description = [
    `<p>${esc(r.text)}</p>`,
    `<p><strong>${r.allowEntry ? "ผู้เช่าอนุญาตให้เข้าห้องตอนไม่อยู่" : "ห้ามเข้าห้องตอนผู้เช่าไม่อยู่ — นัดเวลาก่อน"}</strong></p>`,
    r.preferredTime ? `<p>เวลาสะดวก: ${esc(r.preferredTime)}</p>` : "",
    `<p>เลขงาน ${ticketNo} · ห้อง ${esc(roomNo)} · ${esc(cat.labelTh)}</p>`,
    `<p>จอช่าง: ${esc(jobPath)}</p>`,
  ].join("");
  const res = await createCardFromExternal(systemCtx(r.tenantId, board.systemId), {
    boardId: board.boardId,
    columnId: board.columnId,
    title: `ห้อง ${roomNo} · ${cat.labelTh} · ${short}`,
    description,
    assigneeUserIds: assignee,
    sourceType: "AUTOMATION",
    sourceKey: `${REPAIR_CARD_PREFIX}${r.id}`,
  });
  await (await dormRepairFacade()).linkRepairCard({ tenantId: r.tenantId }, { repairId: r.id, cardId: res.cardId });
  return res.created;
}

/** dorm.repair.created → การ์ด (ไม่มีบอร์ดตามหมวด = ไม่มีการ์ด รอตัวกวาด) */
export async function onDormRepairCreated(evt: BridgeEvent): Promise<void> {
  if (!(await integrationsFor(evt.tenantId)).length) return;
  const repairId = str(evt.payload, "repairId");
  if (!repairId) return;
  const r = await prisma.dormRepair.findFirst({ where: { id: repairId, tenantId: evt.tenantId }, select: REPAIR_SRC_SELECT });
  if (!r || r.kanbanCardId) return;
  await openRepairCard(r, repairCardCache());
}

/** dorm.repair.done → ย้ายการ์ดเข้าคอลัมน์เสร็จ (ช่างกดเสร็จจากมือถือ) ถ้ายังไม่เสร็จ */
export async function onDormRepairDone(evt: BridgeEvent): Promise<void> {
  if (!(await integrationsFor(evt.tenantId)).length) return;
  const repairId = str(evt.payload, "repairId");
  if (!repairId) return;
  const r = await prisma.dormRepair.findFirst({ where: { id: repairId, tenantId: evt.tenantId }, select: { status: true, kanbanCardId: true } });
  if (!r || r.status !== "DONE") return;
  const card = await cardBySourceKey(evt.tenantId, `${REPAIR_CARD_PREFIX}${repairId}`);
  if (!card || card.status !== "ACTIVE" || card.completedAt !== null) return;
  if (r.kanbanCardId && r.kanbanCardId !== card.id) return;
  await closeCard(evt.tenantId, card.systemId, card);
}

/** การ์ดของคำแจ้งในร้านของ event (sourceKey ขึ้นต้น dorm.repair#) · อื่น ⇒ null */
async function repairCardOf(tenantId: string, cardId: string | null): Promise<{ id: string; repairId: string; columnId: string } | null> {
  if (!cardId) return null;
  const card = await prisma.kanbanCard.findFirst({ where: { id: cardId, tenantId }, select: { id: true, sourceKey: true, columnId: true } });
  if (!card?.sourceKey || !card.sourceKey.startsWith(REPAIR_CARD_PREFIX)) return null;
  const repairId = card.sourceKey.slice(REPAIR_CARD_PREFIX.length);
  return repairId ? { id: card.id, repairId, columnId: card.columnId } : null;
}

/** kanban.card.moved → กำลังซ่อม (คอลัมน์ปลายทางไม่ใช่คอลัมน์เสร็จ · ครั้งเดียว · ถอยไม่ได้) */
export async function onDormRepairCardMoved(evt: BridgeEvent): Promise<void> {
  if (!(await integrationsFor(evt.tenantId)).length) return;
  const card = await repairCardOf(evt.tenantId, str(evt.payload, "cardId"));
  if (!card) return;
  const col = await prisma.kanbanColumn.findFirst({ where: { id: str(evt.payload, "toColumnId") ?? card.columnId, tenantId: evt.tenantId }, select: { isDoneColumn: true } });
  if (!col || col.isDoneColumn) return;
  await (await dormRepairFacade()).applyRepairCardState({ tenantId: evt.tenantId }, { repairId: card.repairId, cardId: card.id, state: "IN_PROGRESS", actorUserId: null, source: "CARD" });
}

/** kanban.card.completed → DONE (+ event done ⇒ LINE ครั้งเดียว) */
export async function onDormRepairCardCompleted(evt: BridgeEvent): Promise<void> {
  if (!(await integrationsFor(evt.tenantId)).length) return;
  const card = await repairCardOf(evt.tenantId, str(evt.payload, "cardId"));
  if (!card) return;
  await (await dormRepairFacade()).applyRepairCardState(
    { tenantId: evt.tenantId },
    { repairId: card.repairId, cardId: card.id, state: "DONE", actorUserId: str(evt.payload, "actorUserId"), source: "CARD" },
  );
}

/**
 * ตัวกวาด (minute-job `dorm.repair.cards`) — ซ้อนกันได้ (unique sourceKey + CAS) · ไม่ throw · opts.tenantId จำกัดร้าน
 *  (ก) คำแจ้ง OPEN/IN_PROGRESS ไม่มีการ์ด ใน 14 วัน ของร้านที่มีระบบบอร์ดงาน ⇒ เปิดการ์ด (ไม่มีบอร์ดตามหมวด = ข้าม · แคชผลหาบอร์ดในรอบ)
 *  (ข) การ์ดเสร็จแล้ว (คอลัมน์เสร็จ/completedAt) แต่คำแจ้งยังไม่ DONE (JOIN ใน SQL) ⇒ DONE (source SWEEP)
 *  keyset (createdAt, id) วนหน้าจนหมดงบ — แถวที่ไม่มีบอร์ดถาวรไม่บังงานปกติ
 */
export async function sweepDormRepairCards(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ created: number; reconciled: number }> {
  const t0 = Date.now();
  const out = { created: 0, reconciled: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const left = () => (opts?.signal?.aborted ? 0 : budget - (Date.now() - t0));
  const tid = typeof opts?.tenantId === "string" && opts.tenantId ? opts.tenantId : null;
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const cache = repairCardCache();
  try {
    const since = new Date(at.getTime() - REPAIR_CARD_WINDOW_MS);
    let cur: { createdAt: Date; id: string } | null = null;
    pageA: for (;;) {
      if (left() < 2_000) break;
      const cAt: Date = cur?.createdAt ?? new Date(0);
      const cId: string = cur?.id ?? "";
      const rows = await prisma.$queryRaw<RepairCardSrc[]>`
        SELECT r."id", r."tenantId", r."unitId", r."roomId", r."category", r."text", r."allowEntry", r."preferredTime", r."status", r."kanbanCardId", r."createdAt"
        FROM "DormRepair" r
        WHERE (${tid}::text IS NULL OR r."tenantId" = ${tid}) AND r."status" IN ('OPEN', 'IN_PROGRESS') AND r."kanbanCardId" IS NULL AND r."createdAt" >= ${since}
          AND EXISTS (SELECT 1 FROM "AppSystem" s WHERE s."tenantId" = r."tenantId" AND s."type"::text = 'KANBAN' AND s."active" = true)
          AND (r."createdAt" > ${cAt} OR (r."createdAt" = ${cAt} AND r."id" > ${cId}))
        ORDER BY r."createdAt" ASC, r."id" ASC LIMIT 200`;
      if (!rows.length) break;
      for (const r of rows) {
        cur = { createdAt: r.createdAt, id: r.id };
        if (left() < 2_000) break pageA;
        try {
          if (await openRepairCard(r, cache)) out.created++;
        } catch {
          // คำแจ้งเดียวเปิดการ์ดไม่ได้ (บอร์ด/คอลัมน์ถูกเก็บระหว่างทาง) ไม่ใช่เหตุให้ทั้งรอบล้ม
        }
      }
      if (rows.length < 200) break;
    }
  } catch (e) {
    console.error("[dorm.repair] sweep cards", e instanceof Error ? e.name : "error");
  }
  try {
    let cur: { createdAt: Date; id: string } | null = null;
    pageB: for (;;) {
      if (left() < 2_000) break;
      const cAt: Date = cur?.createdAt ?? new Date(0);
      const cId: string = cur?.id ?? "";
      const rows = await prisma.$queryRaw<{ id: string; tenantId: string; cardId: string; createdAt: Date }[]>`
        SELECT r."id", r."tenantId", c."id" AS "cardId", r."createdAt"
        FROM "DormRepair" r
        JOIN "KanbanCard" c ON c."id" = r."kanbanCardId" AND c."tenantId" = r."tenantId"
        LEFT JOIN "KanbanColumn" k ON k."id" = c."columnId" AND k."tenantId" = c."tenantId"
        WHERE (${tid}::text IS NULL OR r."tenantId" = ${tid}) AND r."status" IN ('OPEN', 'IN_PROGRESS')
          AND (c."completedAt" IS NOT NULL OR k."isDoneColumn" = true)
          AND (r."createdAt" > ${cAt} OR (r."createdAt" = ${cAt} AND r."id" > ${cId}))
        ORDER BY r."createdAt" ASC, r."id" ASC LIMIT 200`;
      if (!rows.length) break;
      const facade = await dormRepairFacade();
      for (const r of rows) {
        cur = { createdAt: r.createdAt, id: r.id };
        if (left() < 2_000) break pageB;
        const s = await facade.applyRepairCardState({ tenantId: r.tenantId }, { repairId: r.id, cardId: r.cardId, state: "DONE", actorUserId: null, source: "SWEEP" }, { now: at });
        if (s.changed) out.reconciled++;
      }
      if (rows.length < 200) break;
    }
  } catch (e) {
    console.error("[dorm.repair] sweep done", e instanceof Error ? e.name : "error");
  }
  return out;
}
// ◂ SVC D.16
