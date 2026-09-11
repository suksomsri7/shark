// tools-member.ts — เครื่องมือของสกิล `members` (ระบบสมาชิก) สำหรับผู้ช่วย AI (M1.11)
//
// ไฟล์นี้บาง ๆ โดยตั้งใจ: **ไม่มีความรู้เรื่องระบบสมาชิกเลย**
//   - รายชื่อ/สคีมา/การรัน = `@/lib/modules/member/api/tools` (สร้างจาก `MEMBER_OPS` = ทะเบียน op ของ REST ตัวเดียวกัน)
//   - การเก็บข้อเสนอ = `./proposals` (createProposal ตัวเดิมของ tool อีก 60+ ตัว)
// ⇒ เพิ่มเครื่องมือของระบบสมาชิกใหม่ = ใส่ `tool: { name, hint }` ให้ op ในทะเบียน แล้วเติมชื่อใน skills.ts
//   (ด่าน fitness F13.9 + assertSkillRegistryComplete จะจับให้เองถ้าลืม)
//
// กติกา 3 ชั้นตามสัญญา §M1.11 (เหมือนบัญชี/บอร์ดงานเป๊ะ):
//   read   → ทำทันที (actor `assistant` อ่านอย่างเดียว · ไม่เห็นข้อมูลอ่อนไหว)
//   write  → ข้อเสนอ `member.<op id>` ให้เจ้าของกดยืนยัน (pendingConfirmation ของการ์ดยืนยันใต้แชท)
//   danger → ข้อเสนอที่ `risk: DESTRUCTIVE` ⇒ ต้องยืนยัน 2 ชั้น (proposals.ts เป็นคนบังคับ)
//
// 🔴 ชื่อ tool เดิม 8 ตัวของสกิล `members` (member_count · member_create · customer_search ·
//    customer_points · point_adjust · reward_redeem · reward_list_redemptions · coupon_create)
//    **ไม่ได้มาจากทะเบียนนี้** — เป็น tool รุ่นแรกที่เขียนมือไว้ใน `tools.ts` และยังต้องคงชื่อไว้
//    (โมเดล/สกิลของลูกค้าอ้างชื่อพวกนั้นอยู่) ⇒ ชื่อของทะเบียนนี้จึงขึ้นต้น `member_` แต่ **ไม่ชนกับ 8 ตัวนั้น**

import { memberToolInfos, runMemberTool } from "@/lib/modules/member/api/tools";
import { MEMBER_OPS } from "@/lib/modules/member/api/registry";
import { createProposal, type ProposalKind } from "./proposals";
import type { AiTool, ToolCtx } from "./tools";

/** สถานะที่ตอบกลับเมื่อข้อเสนอถูกสร้างแล้วและกำลังรอคนกดยืนยัน (รูปแบบเดียวกับ action tool ทุกตัว) */
const pendingConfirmation = "user_confirm" as const;

/**
 * เครื่องมือของระบบสมาชิกทั้งชุด — สร้างจาก `MEMBER_OPS.filter(o => o.tool)`
 * (ผ่าน `memberToolInfos()` ซึ่งเป็นตัวห่อของทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สองในระบบ)
 */
export function memberTools(): AiTool[] {
  return memberToolInfos().map((info): AiTool => ({
    // action = true ⇒ ชั้นแชท/แอปรู้ว่าเครื่องมือนี้ต้องมี conversation + การ์ดยืนยัน
    ...(info.write ? { action: true as const } : {}),
    def: { name: info.name, description: info.description, parameters: info.parameters },
    async execute(ctx: ToolCtx, args: unknown): Promise<string> {
      const outcome = await runMemberTool(
        { tenantId: ctx.tenantId, ...(ctx.systemId ? { systemId: ctx.systemId } : {}) },
        info.name,
        args,
      );
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
 * จำนวนเครื่องมือที่ต้องมี = จำนวน op ที่ประกาศ `tool` ในทะเบียน REST
 * ใช้เป็นด่านกันคนเผลอ filter ทิ้งระหว่างทาง
 */
export function memberToolCount(): number {
  return MEMBER_OPS.filter((o) => o.tool).length;
}
