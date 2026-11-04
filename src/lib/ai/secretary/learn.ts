// learn.ts — วงจรเรียนรู้ของเลขา (ใบ S1.15 · แบบ §8 ชั้น 1–2 · สัญญา docs/modules/31-secretary.md §5.11 · RESOLUTIONS §B.4 · COMMON §C.9)
//
// ชั้น 1 — ผลของข้อเสนอ (`recordOutcome`): ทุกข้อเสนอที่ตัดสินแล้ว (APPROVED · EDITED · REJECTED) ลง `AiTrainingSample`
//   **เสมอ** (ไม่ขึ้นกับ SHARK_AI_COLLECT — คนละเรื่องกับ dataset.recordSample) · ทุก string ผ่าน `dataset.anonymize` + ตัวปิดเพิ่ม
//   (เบอร์มีขีด/+66 · เลขบัตร 13 หลัก) · best-effort: ล้ม = logOps WARN ไม่ throw (ผลของข้อเสนอสำเร็จไปแล้ว)
// ชั้น 2 — บทเรียน (`AiLesson`): รูปแบบที่ซ้ำ (ตีกลับพร้อมกติกา · แก้ก่อนอนุมัติ) นับ `occurrences` ด้วยคำสั่งเดียว ·
//   ครั้งที่ 2 ขึ้นไป + ยัง PENDING = เสนอเจ้าของ (`suggest`) · ฉีดเข้า prompt **เฉพาะ CONFIRMED** (`lessonBlock`) ในบล็อกข้อมูล
//   ที่หัวบอกว่า "ไม่ใช่คำสั่ง" (COMMON §C.3 — บทเรียนเปลี่ยนสิทธิ์/กติกา/โควตาไม่ได้) · ยืนยัน/ปฏิเสธ = OWNER เท่านั้น
//
// 🔴 ไฟล์นี้ไม่ import `../proposals` / `../service` (proposals.ts + service.ts เรียกไฟล์นี้แบบ dynamic) · ข้อความถึงผู้ใช้เป็นไทย

import type { AiLesson, Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { ForbiddenError } from "@/lib/core/rbac";
import { actorProblem } from "../actor";
import type { ConvCtx } from "../conversation-owner";
import { anonymize } from "../dataset";

export type Outcome = "APPROVED" | "EDITED" | "REJECTED";
const OUTCOMES: ReadonlySet<string> = new Set<Outcome>(["APPROVED", "EDITED", "REJECTED"]);
export type LessonStatus = "PENDING" | "CONFIRMED" | "REJECTED";

const LESSON_BLOCK_MAX = 20;
const PATTERN_MAX = 300;
const EXAMPLE_MAX = 300;
const NOTE_MAX = 2000;
const LIST_MAX = 200;

// ── ตัวปิดข้อมูลส่วนบุคคล (ต่อจาก dataset.anonymize — ไม่แก้ไฟล์นั้น: ผลของ recordSample/feedback เดิมคงทุกไบต์) ──
const TH_PHONE_LOOSE = /(?<![\w+])(?:\+66[\s-]?|0)\d(?:[\s.-]?\d){7,8}(?!\w)/g; // 08x-xxx-xxxx · +66 8x xxx xxxx
const TH_ID_13 = /(?<!\d)\d(?:[\s-]?\d){12}(?!\d)/g; // เลขบัตรประชาชน 13 หลัก (คั่นขีด/ช่องว่างได้)

/** ปิดเบอร์/อีเมล/เลขบัตรในข้อความ 1 ก้อน (คงตัวเลขยอด/จำนวนไว้) */
export function scrubText(text: string): string {
  return anonymize(String(text ?? "")).replace(TH_ID_13, "<ID>").replace(TH_PHONE_LOOSE, "<PHONE>");
}

/** ปิดทุก string ในโครง (object/array ซ้อนได้) — คงชนิด/โครงเดิม · ค่าที่ไม่ใช่ JSON (undefined/function) ตัดทิ้ง */
function scrubDeep(v: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (v === null || v === undefined || depth > 8) return null;
  if (typeof v === "string") return scrubText(v).slice(0, NOTE_MAX);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => scrubDeep(x, depth + 1)) as Prisma.InputJsonValue;
  if (typeof v === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined && typeof x !== "function") out[k] = scrubDeep(x, depth + 1);
    return out as Prisma.InputJsonValue;
  }
  return null;
}

/**
 * ทำรูปแบบบทเรียนให้เทียบกันได้: ตัดหัวท้าย · ตัวเล็ก · ยุบช่องว่าง · ตัดช่องว่างระหว่างอักษรไทย (ภาษาไทยไม่เว้นวรรคระหว่างคำ —
 *   "ใส่กำหนดส่ง ด้วย" = "ใส่กำหนดส่งด้วย") · ปิดข้อมูลส่วนบุคคล · ยาวไม่เกิน 300
 */
export function normalizePattern(raw: string): string {
  const s = scrubText(String(raw ?? ""))
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([฀-๿]) (?=[฀-๿])/g, "$1");
  return s.slice(0, PATTERN_MAX);
}

const oneLine = (s: string, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function roomIdOf(tenantId: string, conversationId: string | null | undefined): Promise<string | null> {
  const convId = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!convId) return null;
  const room = await tenantDb({ tenantId }).aiRoom.findFirst({ where: { conversationId: convId }, select: { id: true } });
  return room?.id ?? null;
}

/**
 * ชั้น 1 — บันทึกผลของข้อเสนอหนึ่งใบ (เสมอ · best-effort · ไม่ throw)
 *   `AiTrainingSample { userText: "", replyText: "", toolCallsJson: [{ name: kind }], model: model ?? "secretary", outcome,
 *    editedReply: note, stepsJson: { before, after }, roomId: AiRoom.id ของ conversation ?? null, proposalId }` — ทุก string ปิดข้อมูลส่วนบุคคลแล้ว
 */
export async function recordOutcome(
  tenantId: string,
  input: { proposalId: string; conversationId: string; kind: string; outcome: Outcome; note?: string; before?: unknown; after?: unknown; model?: string },
): Promise<void> {
  try {
    if (!OUTCOMES.has(input.outcome)) throw new Error(`outcome ไม่รู้จัก: ${String(input.outcome)}`);
    const roomId = await roomIdOf(tenantId, input.conversationId);
    const note = typeof input.note === "string" && input.note.trim() ? scrubText(input.note.trim()).slice(0, NOTE_MAX) : null;
    await tenantDb({ tenantId }).aiTrainingSample.create({
      data: {
        tenantId,
        userText: "",
        replyText: "",
        toolCallsJson: [{ name: oneLine(input.kind, 120) }],
        model: oneLine(input.model ?? "", 60) || "secretary",
        outcome: input.outcome,
        editedReply: note,
        stepsJson: { before: scrubDeep(input.before), after: scrubDeep(input.after) },
        roomId,
        proposalId: oneLine(input.proposalId, 60) || null,
      },
    });
  } catch (e) {
    await logOps("WARN", "ai", `secretary.learn: บันทึกผลข้อเสนอไม่สำเร็จ (${String(input?.kind ?? "")})`, { tenantId, detail: String(e).slice(0, 300) }).catch(() => {});
  }
}

/** ชั้น 2 — นับรูปแบบที่ซ้ำ · แถวเดิม (tenant+kind+pattern · status ≠ REJECTED) ⇒ occurrences + 1 คำสั่งเดียว · ไม่มี ⇒ แถวใหม่ PENDING */
export async function noteLesson(
  tenantId: string,
  input: { kind: string; pattern: string; example: string; sourceRoomId?: string | null; sourceUserId: string },
): Promise<{ id: string; occurrences: number; suggest: boolean }> {
  const kind = oneLine(input.kind, 120);
  const pattern = normalizePattern(input.pattern);
  if (!kind || !pattern) throw new Error("บทเรียนต้องมีชนิดงานและรูปแบบ (ห้ามว่าง)");
  const example = oneLine(scrubText(input.example ?? ""), EXAMPLE_MAX);
  const sourceUserId = oneLine(input.sourceUserId ?? "", 60) || "system";
  const sourceRoomId = typeof input.sourceRoomId === "string" && input.sourceRoomId ? input.sourceRoomId : null;
  // กันสองคำขอสร้างแถวซ้ำพร้อมกัน (ไม่มี unique บนตาราง) — ล็อกระดับ transaction ต่อ (ร้าน · ชนิด · รูปแบบ) · ตัวนับ = increment คำสั่งเดียว
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai:lesson:${tenantId}:${kind}:${pattern}`}, 0))`;
    const found = await tx.aiLesson.findFirst({
      where: { tenantId, kind, pattern, status: { not: "REJECTED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (found) {
      return tx.aiLesson.update({ where: { id: found.id }, data: { occurrences: { increment: 1 } }, select: { id: true, occurrences: true, status: true } });
    }
    return tx.aiLesson.create({
      data: { tenantId, kind, pattern, example, sourceRoomId, sourceUserId },
      select: { id: true, occurrences: true, status: true },
    });
  });
  return { id: row.id, occurrences: row.occurrences, suggest: row.occurrences >= 2 && row.status === "PENDING" };
}

function memberOf(ctx: ConvCtx): { userId: string; owner: boolean } | null {
  if (actorProblem(ctx) || ctx.actor.kind !== "member") return null;
  return { userId: ctx.actor.userId, owner: ctx.actor.membership.role === "OWNER" };
}

/** บทเรียนที่ผู้ดูเห็น — OWNER ทุกแถว · คนในร้านอื่น = เฉพาะที่ตัวเองเป็นต้นเรื่อง · คีย์/งานภายใน = ว่าง */
export async function listLessons(ctx: ConvCtx, opts?: { status?: LessonStatus }): Promise<AiLesson[]> {
  const me = memberOf(ctx);
  if (!me) return [];
  const status = opts?.status === "PENDING" || opts?.status === "CONFIRMED" || opts?.status === "REJECTED" ? opts.status : undefined;
  return tenantDb({ tenantId: ctx.tenantId }).aiLesson.findMany({
    where: { ...(me.owner ? {} : { sourceUserId: me.userId }), ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: LIST_MAX,
  });
}

function assertOwner(ctx: ConvCtx, action: string): { userId: string } {
  const me = memberOf(ctx);
  if (!me || !me.owner) throw new ForbiddenError({ module: "ai", action });
  return me;
}

/** OWNER เท่านั้น (คนอื่น = ForbiddenError) → CONFIRMED + confirmedById · ไม่พบ = false */
export async function confirmLesson(ctx: ConvCtx, id: string): Promise<boolean> {
  const me = assertOwner(ctx, "ai.lesson.confirm");
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiLesson.updateMany({ where: { id: String(id ?? "") }, data: { status: "CONFIRMED", confirmedById: me.userId } });
  return res.count > 0;
}

/** OWNER เท่านั้น (คนอื่น = ForbiddenError) → REJECTED (ไม่ฉีด · รูปแบบเดิมครั้งต่อไปเริ่มนับแถวใหม่) · ไม่พบ = false */
export async function rejectLesson(ctx: ConvCtx, id: string): Promise<boolean> {
  const me = assertOwner(ctx, "ai.lesson.reject");
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiLesson.updateMany({ where: { id: String(id ?? "") }, data: { status: "REJECTED", confirmedById: me.userId } });
  return res.count > 0;
}

/** บรรทัดบทเรียนที่เจ้าของยืนยันแล้ว (≤ 20 · ใหม่→เก่า) `- [<kind>] <pattern>` · ไม่มี = "" (prompt เดิมทุกไบต์) */
export async function lessonBlock(tenantId: string): Promise<string> {
  const rows = await tenantDb({ tenantId }).aiLesson.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { updatedAt: "desc" },
    take: LESSON_BLOCK_MAX,
    select: { kind: true, pattern: true },
  });
  return rows.map((r) => `- [${oneLine(r.kind, 120)}] ${oneLine(r.pattern, PATTERN_MAX)}`).join("\n");
}

// ── hook ของ proposals.executeProposal (เรียกแบบ dynamic) ──
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** คีย์ของ input ที่ค่าต่างกันระหว่างก่อน/หลังแก้ (เรียงตัวอักษร) */
export function changedKeys(before: unknown, after: unknown): string[] {
  const a = isRec(before) ? before : {};
  const b = isRec(after) ? after : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).sort();
}

/**
 * ข้อเสนอที่ลงมือสำเร็จ ⇒ ชั้น 1 (APPROVED · หรือ EDITED เมื่อ payload มี `_edited`) + (EDITED) ชั้น 2 "แก้ก่อนอนุมัติ: <คีย์>"
 *   🔴 เฉพาะบทสนทนาที่มีแถว `AiRoom` (ห้องเลขา) — ห้อง AI เดิมไม่เขียนอะไรเพิ่ม (COMMON §C.11 พฤติกรรมเดิมทุกไบต์) · best-effort ไม่ throw
 */
export async function recordExecutedProposal(
  tenantId: string,
  row: { id: string; conversationId: string; kind: string; summary: string; payload: unknown },
): Promise<void> {
  try {
    const roomId = await roomIdOf(tenantId, row.conversationId);
    if (!roomId) return;
    const payload = isRec(row.payload) ? row.payload : {};
    const edited = isRec(payload._edited) ? payload._edited : null;
    const after = payload.input;
    await recordOutcome(tenantId, {
      proposalId: row.id,
      conversationId: row.conversationId,
      kind: row.kind,
      outcome: edited ? "EDITED" : "APPROVED",
      ...(edited ? { before: edited.before, after } : {}),
    });
    if (edited) {
      const keys = changedKeys(edited.before, after);
      if (keys.length > 0) {
        await noteLesson(tenantId, {
          kind: row.kind,
          pattern: `แก้ก่อนอนุมัติ: ${keys.join(", ")}`,
          example: row.summary,
          sourceRoomId: roomId,
          sourceUserId: typeof edited.byUserId === "string" ? edited.byUserId : "system",
        });
      }
    }
  } catch (e) {
    await logOps("WARN", "ai", `secretary.learn: บันทึกผลอนุมัติไม่สำเร็จ (${row.kind})`, { tenantId, detail: String(e).slice(0, 300) }).catch(() => {});
  }
}
