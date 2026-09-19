// tools-crm.ts — เครื่องมือของสกิล `crm` สำหรับผู้ช่วย AI (ใบ C1.10 · 14 ตัวของ RESOLUTIONS R-E.4)
//
// ไฟล์นี้บาง ๆ โดยตั้งใจ: **ไม่มีความรู้เรื่อง CRM เลย**
//   - รายชื่อ/สคีมา/การรัน = `@/lib/modules/crm/api/tools` (สร้างจาก `CRM_OPS` = ทะเบียน op ของ REST ตัวเดียวกัน)
//   - การเก็บข้อเสนอ = `./proposals` (createProposal ตัวเดิมของทุก tool)
// ⇒ เพิ่มเครื่องมือ CRM = ใส่ `tool: { name, hint }` ให้ op ในทะเบียน แล้วเติมชื่อในสกิล `crm` ของ skills.ts
//   (ด่าน fitness F13.12 + assertSkillRegistryComplete จับให้ถ้าลืม)
//
// กติกา 3 ชั้น: read → ทำทันทีด้วยสิทธิ์ของ "คนที่ถาม" (ไม่รู้ว่าใคร = ปฏิเสธ) · write → ข้อเสนอ `crm.<op id>` ให้คนกดยืนยัน ·
//   danger → ข้อเสนอ DESTRUCTIVE (ยืนยัน 2 ชั้น — proposals.ts บังคับ)
// 🔴 `crm_create_lead` ชื่อเดิมของ tool รุ่นแรก (B2-A1) — คงชื่อไว้ (โมเดล/สกิลของลูกค้าอ้างชื่อนี้) · ระบบ CRM รุ่นเดิม (uiVersion 1)
//    ยังเสนอ kind เดิม `crm_create_lead` เหมือนก่อน C1.10 (R-E.14 PERMANENT RULE)

import { crmApi } from "@/lib/modules/crm";
import { createProposal, type ProposalKind } from "./proposals";
import type { AiTool, ToolCtx } from "./tools";

/** สถานะที่ตอบเมื่อข้อเสนอถูกสร้างแล้วและรอคนกดยืนยัน (รูปแบบเดียวกับ action tool ทุกตัว) */
const pendingConfirmation = "user_confirm" as const;

/** เครื่องมือของ CRM ทั้งชุด — สร้างจาก `CRM_OPS.filter(o => o.tool)` (ไม่มีรายชื่อชุดที่สอง) */
export function crmTools(): AiTool[] {
  return crmApi.crmToolInfos().map((info): AiTool => {
    // 🔴 `crm_create_lead` ใช้สคีมาเดิมทุกไบต์ (ร้าน CRM รุ่นเดิมต้องเห็นเครื่องมือตัวเดิม — มติผู้คุมงาน C1.10 "Production v1")
    const legacy = info.name === crmApi.LEGACY_CRM_LEAD_TOOL_DEF.name;
    return {
    ...(info.write ? { action: true as const } : {}),
    def: legacy
      ? { name: crmApi.LEGACY_CRM_LEAD_TOOL_DEF.name, description: crmApi.LEGACY_CRM_LEAD_TOOL_DEF.description, parameters: crmApi.LEGACY_CRM_LEAD_TOOL_DEF.parameters }
      : { name: info.name, description: info.description, parameters: info.parameters },
    async execute(ctx: ToolCtx, args: unknown): Promise<string> {
      const tctx = { tenantId: ctx.tenantId, ...(ctx.systemId ? { systemId: ctx.systemId } : {}) };
      const outcome = legacy ? await crmApi.runCrmLeadTool(tctx, args) : await crmApi.runCrmTool(tctx, info.name, args);
      if (outcome.mode === "error") return JSON.stringify({ error: outcome.error });
      if (outcome.mode === "read") return JSON.stringify(outcome.result);
      if (!ctx.conversationId) return JSON.stringify({ error: "ต้องอยู่ในบทสนทนาก่อนจึงจะเสนอการกระทำได้" });
      const p = await createProposal(
        { tenantId: ctx.tenantId },
        { conversationId: ctx.conversationId, kind: outcome.kind as ProposalKind, summary: outcome.summary, payload: outcome.payload },
      );
      return JSON.stringify({ proposalId: p.id, summary: outcome.summary, waiting: pendingConfirmation });
    },
    };
  });
}

/** จำนวนเครื่องมือที่ต้องมี = op ที่ประกาศ `tool` ในทะเบียน REST (ด่านกันคนเผลอ filter ทิ้ง) */
export function crmToolCount(): number {
  return crmApi.CRM_OPS.filter((o) => o.tool).length;
}
