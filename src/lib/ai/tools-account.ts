// tools-account.ts — เครื่องมือของสกิล `account` สำหรับผู้ช่วย AI (WO E1)
//
// ไฟล์นี้บาง ๆ โดยตั้งใจ: **ไม่มีความรู้เรื่องบัญชีเลย**
//   - รายชื่อ/สคีมา/การรัน = `./account-ops` (สร้างจากทะเบียน op ของ REST ตัวเดียวกัน)
//   - การเก็บข้อเสนอ = `./proposals` (createProposal ตัวเดิมของ tool อีก 63 ตัว)
// ⇒ เพิ่มเครื่องมือบัญชีใหม่ = ใส่ `tool: { name, hint }` ให้ op ในทะเบียน แล้วเติมชื่อใน skills.ts
//   (ด่าน fitness F13.3 + assertSkillRegistryComplete จะจับให้เองถ้าลืม)

import { accountToolInfos, runAccountTool } from "./account-ops";
import { createProposal, type ProposalKind } from "./proposals";
import type { AiTool, ToolCtx } from "./tools";
import { actorProblem, aiActorMembership, aiActorUserId, keyPermissions, type AiActor } from "./actor";
import { toMemberActor } from "@/lib/modules/member/access";

/**
 * CRM C5.5-fix14 r3 (รีวิว RV14-2) ▸ ผู้ถามในสายตาโมดูลสมาชิก/CRM — รูปเดียวกับประตูเว็บ/REST:
 *   คน (และงานภายในที่ประกาศชื่อ) = สมาชิกภาพของเขา (`crmViewerOfSession`) · คีย์ = scope ของคีย์ (`crmViewerOfApi`) · อื่น ๆ = null (ปิด)
 */
function askerOf(a: AiActor) {
  if (a.kind === "apiKey") return { userId: "", role: "STAFF" as const, unitAccess: ["*"], permissions: keyPermissions(a.scopes), apiRole: "readonly" as const, keyId: a.keyId };
  const m = aiActorMembership(a);
  return m ? toMemberActor(aiActorUserId(a) ?? "", m) : null;
}

/**
 * เครื่องมือบัญชีทั้งชุด — สร้างจาก `ACCOUNT_OPS.filter(o => o.tool)`
 * read  → ทำทันที คืน JSON คีย์ไทย
 * write → สร้างข้อเสนอ (`account.<op id>`) ให้เจ้าของกดยืนยัน แล้วจึงลงมือผ่าน dispatch เดียวกับ REST
 */
export function accountTools(): AiTool[] {
  return accountToolInfos().map((info): AiTool => ({
    // action = true ⇒ ชั้นแชท/แอปรู้ว่าเครื่องมือนี้ต้องมี conversation + การ์ดยืนยัน
    ...(info.write ? { action: true as const } : {}),
    def: { name: info.name, description: info.description, parameters: info.parameters },
    async execute(ctx: ToolCtx, args: unknown): Promise<string> {
      // CRM C5.5-G1 r2 (F6) ▸ ไม่มี actor ที่ใช้ได้ = ปฏิเสธ (ไม่ถอยไปชุดอ่านกว้าง/คุกกี้ของคำขอ) ◂
      const bad = actorProblem(ctx);
      if (bad) return JSON.stringify({ error: bad });
      const outcome = await runAccountTool(ctx.tenantId, info.name, args, {
        ...(ctx.systemId ? { systemId: ctx.systemId } : {}),
        // CRM C5.5-G1 ▸ อ่านด้วยสิทธิ์บัญชีของผู้ถาม (คีย์ API = ผ่านด่าน scope มาแล้ว → ชุดอ่านของผู้ช่วยตามเดิม) ◂
        viewer: aiActorMembership(ctx.actor),
        asker: askerOf(ctx.actor),
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
      // waiting: user_confirm = ยังไม่ทำ ต้องรอ user กดยืนยัน (รูปแบบเดียวกับ action tool เดิมทุกตัว)
      return JSON.stringify({ proposalId: p.id, summary: outcome.summary, waiting: "user_confirm" });
    },
  }));
}
