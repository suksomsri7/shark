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

/** สถานะที่ตอบกลับเมื่อข้อเสนอถูกสร้างแล้วและกำลังรอคนกดยืนยัน (รูปแบบเดียวกับ action tool ทุกตัว) */
const pendingConfirmation = "user_confirm" as const;

/**
 * เครื่องมือบอร์ดงานทั้งชุด — สร้างจาก `KANBAN_OPS.filter(o => o.tool)`
 * (ผ่าน `kanbanToolInfos()` ซึ่งเป็นตัวห่อของทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สองในระบบ)
 */
export function kanbanTools(): AiTool[] {
  return kanbanToolInfos().map((info): AiTool => ({
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
 * จำนวนเครื่องมือที่ต้องมี = จำนวน op ที่ประกาศ `tool` ในทะเบียน
 * (ตัวเลขนี้อ่านจาก `KANBAN_OPS` ตรง ๆ — ใช้เป็นด่านกันคนเผลอ filter ทิ้งระหว่างทาง)
 */
export function kanbanToolCount(): number {
  return KANBAN_OPS.filter((o) => o.tool).length;
}
