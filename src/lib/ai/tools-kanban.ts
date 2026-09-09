// tools-kanban.ts — เครื่องมือของสกิล `tasks` (บอร์ดงาน) สำหรับผู้ช่วย AI (K1.15 · D15)
//
// ไฟล์นี้บาง ๆ โดยตั้งใจ: **ไม่มีความรู้เรื่องบอร์ดงานเลย**
//   - รายชื่อ/สคีมา/การรัน = `./kanban-ops` (สร้างจาก `KANBAN_OPS` = ทะเบียน op ของ REST ตัวเดียวกัน)
//   - การเก็บข้อเสนอ = `./proposals` (createProposal ตัวเดิมของ tool อีก 60+ ตัว)
// ⇒ เพิ่มเครื่องมือบอร์ดงานใหม่ = ใส่ `tool: { name, hint }` ให้ op ในทะเบียน แล้วเติมชื่อใน skills.ts
//   (ด่าน fitness F13.3 + assertSkillRegistryComplete จะจับให้เองถ้าลืม)
//
// กติกา 3 ชั้นตามสัญญา §K1.15:
//   read   → ทำทันที (actor `assistant` อ่านอย่างเดียว)
//   write  → ข้อเสนอ `kanban.<op id>` ให้เจ้าของกดยืนยัน (pendingConfirmation ของการ์ดยืนยันใต้แชท)
//   danger → ข้อเสนอที่ `risk: DESTRUCTIVE` ⇒ ต้องยืนยัน 2 ชั้น (proposals.ts เป็นคนบังคับ)

import { KANBAN_OPS } from "@/lib/modules/kanban/api/registry";
import { kanbanToolInfos, runKanbanTool } from "./kanban-ops";
import { createProposal, type ProposalKind } from "./proposals";
import type { AiTool, ToolCtx } from "./tools";
import { prisma } from "@/lib/core/db";

/** สถานะที่ตอบกลับเมื่อข้อเสนอถูกสร้างแล้วและกำลังรอคนกดยืนยัน (รูปแบบเดียวกับ action tool ทุกตัว) */
const pendingConfirmation = "user_confirm" as const;

/**
 * เครื่องมือบอร์ดงานทั้งชุด — สร้างจาก `KANBAN_OPS.filter(o => o.tool)`
 * (ผ่าน `kanbanToolInfos()` ซึ่งเป็นตัวห่อของทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สองในระบบ)
 */
export function kanbanTools(): AiTool[] {
  return kanbanToolInfos().map((info): AiTool => (info.name === "kanban_my_tasks" ? legacyMyTasks(info.description) : {
    // action = true ⇒ ชั้นแชท/แอปรู้ว่าเครื่องมือนี้ต้องมี conversation + การ์ดยืนยัน
    ...(info.write ? { action: true as const } : {}),
    def: { name: info.name, description: info.description, parameters: info.parameters },
    async execute(ctx: ToolCtx, args: unknown): Promise<string> {
      const outcome = await runKanbanTool(ctx.tenantId, info.name, args, {
        ...(ctx.systemId ? { systemId: ctx.systemId } : {}),
      });
      if (outcome.mode === "error") return JSON.stringify({ error: outcome.error });
      if (outcome.mode === "read") return JSON.stringify(outcome.result);
      // ── เขียน: ต้องอยู่ในบทสนทนา (ข้อเสนอผูกกับการ์ดยืนยันใต้แชท) ──
      if (!ctx.conversationId) {
        return JSON.stringify({ error: "ต้องอยู่ในบทสนทนาก่อนจึงจะเสนอการกระทำได้" });
      }
      const p = await createProposal(
        { tenantId: ctx.tenantId },
        {
          conversationId: ctx.conversationId,
          kind: outcome.kind as ProposalKind,
          summary: outcome.summary,
          payload: outcome.payload,
        },
      );
      return JSON.stringify({ proposalId: p.id, summary: outcome.summary, waiting: pendingConfirmation });
    },
  }));
}

/**
 * จำนวนเครื่องมือที่ต้องมี = จำนวน op ที่ประกาศ `tool` (ทะเบียน REST `KANBAN_OPS`
 * + op เฉพาะฝั่งผู้ช่วยของ K3.5) — ใช้เป็นด่านกันคนเผลอ filter ทิ้งระหว่างทาง
 */
export function kanbanToolCount(): number {
  return kanbanToolInfos().length;
}

/** จำนวน tool ที่มี endpoint REST คู่กัน (ต่างจากตัวบนเมื่อมี op เฉพาะฝั่งผู้ช่วย) */
export function kanbanRestToolCount(): number {
  return KANBAN_OPS.filter((o) => o.tool).length;
}

// ── kanban_my_tasks แบบเดิม (W5B-R1) — คงสัญญาเดิมของสกิล `tasks` ไว้ (ข้อสอบ qc-ai-wave5b W5B-4.x):
//    ToolCtx ไม่มี userId ⇒ (ก) ระบุ assignee = ชื่อ/อีเมลพนักงาน → งานของคนนั้น
//    (ข) ไม่ระบุ → งานที่ยังไม่มีผู้รับ + งานทั้งหมดที่กำลังทำ + หมายเหตุข้อจำกัด
//    (op `my-tasks` ของ REST รับ userId ตรง ๆ — คนละสัญญากับเครื่องมือแชทที่คุยกับคนด้วยชื่อ)
function legacyMyTasks(description: string): AiTool {
  const cardOut = (c: { title: string; dueAt: Date | null; board: { name: string } | null; column: { name: string } | null }) => ({
    งาน: c.title,
    บอร์ด: c.board?.name ?? null,
    สถานะ: c.column?.name ?? null,
    กำหนดส่ง: c.dueAt ? c.dueAt.toISOString() : null,
  });
  return {
    def: {
      name: "kanban_my_tasks",
      description: `${description} ระบุ assignee (ชื่อหรืออีเมลพนักงาน) เพื่อดูงานของคนนั้น · ไม่ระบุ = งานที่ยังไม่มีผู้รับ + งานทั้งหมดที่กำลังทำ`,
      parameters: {
        type: "object",
        properties: {
          assignee: { type: "string", description: "ชื่อหรืออีเมลของพนักงานผู้รับงาน (ไม่ระบุ = ดูงานที่ยังไม่มีผู้รับและงานทั้งหมด)" },
        },
        additionalProperties: false,
      },
    },
    async execute(ctx: ToolCtx, args: unknown): Promise<string> {
      const kanban = await prisma.appSystem.findFirst({ where: { tenantId: ctx.tenantId, type: "KANBAN", active: true }, select: { id: true } });
      if (!kanban) return JSON.stringify({ error: "ร้านนี้ยังไม่ได้เปิดระบบบอร์ดงาน (Kanban)" });
      const assignee = String((args as { assignee?: unknown } | null)?.assignee ?? "").trim();
      const include = { board: { select: { name: true } }, column: { select: { name: true } } } as const;
      const order = [{ dueAt: { sort: "asc" as const, nulls: "last" as const } }, { createdAt: "asc" as const }];
      if (assignee) {
        const members = await prisma.membership.findMany({
          where: {
            tenantId: ctx.tenantId,
            OR: [
              { user: { name: { contains: assignee, mode: "insensitive" } } },
              { user: { email: { contains: assignee, mode: "insensitive" } } },
            ],
          },
          select: { userId: true, user: { select: { name: true, email: true } } },
        });
        if (members.length === 0) return JSON.stringify({ error: `ไม่พบพนักงานชื่อ/อีเมล "${assignee}" ในร้านนี้` });
        if (members.length > 1) {
          return JSON.stringify({ error: `มีพนักงานหลายคนที่ตรง กรุณาระบุให้ชัด — ${members.map((m) => m.user.name ?? m.user.email).join(", ")}` });
        }
        const target = members[0]!;
        const cards = await prisma.kanbanCard.findMany({
          where: {
            tenantId: ctx.tenantId, systemId: kanban.id, status: "ACTIVE",
            OR: [{ assigneeUserId: target.userId }, { assignees: { some: { userId: target.userId } } }],
          },
          include, orderBy: order, take: 50,
        });
        return JSON.stringify({ ผู้รับงาน: target.user.name ?? target.user.email, จำนวนงาน: cards.length, งานของฉัน: cards.map(cardOut) });
      }
      const [unassigned, all] = await Promise.all([
        prisma.kanbanCard.findMany({ where: { tenantId: ctx.tenantId, systemId: kanban.id, status: "ACTIVE", assigneeUserId: null, assignees: { none: {} } }, include, orderBy: order, take: 50 }),
        prisma.kanbanCard.findMany({ where: { tenantId: ctx.tenantId, systemId: kanban.id, status: "ACTIVE" }, include, orderBy: order, take: 50 }),
      ]);
      return JSON.stringify({
        หมายเหตุ: "ยังไม่ทราบว่าใครกำลังคุยอยู่ — ระบุชื่อพนักงาน (assignee) เพื่อดูงานของคนนั้นโดยเฉพาะ",
        งานที่ยังไม่มีผู้รับ: unassigned.map(cardOut),
        งานทั้งหมดที่กำลังทำ: all.map(cardOut),
      });
    },
  };
}
