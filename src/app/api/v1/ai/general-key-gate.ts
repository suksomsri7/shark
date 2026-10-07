// HF-APIV1 ▸ ด่านเครื่องมือ AI "นอกโมดูล" ของ `/api/v1/ai/*` (ใช้ร่วม 3 route: skills · skills/[id] · tools/[name])
//
// เครื่องมือของ 4 โมดูลที่มีทะเบียน scope (บัญชี · บอร์ดงาน · สมาชิก · CRM) ตัดสินด้วย scope ของคีย์ตามเดิมทุกอย่าง
// (`toolAllowedForApiKey` ใน ai/skills.ts — ไม่แตะ) · เครื่องมืออื่นทั้งหมด (ขาย POS · การเงิน · คลัง · ความจำ · คลังความรู้ ·
// แชท · core ฯลฯ) ไม่มี scope ของตัวเอง ⇒ เปิดเฉพาะ "คีย์กลาง" (scopes [] ไม่ผูกระบบ) — คีย์ของโมดูลห้ามข้ามมาใช้
// กติกาผลลัพธ์: สารบัญ (skills · skills/[id]) กรองทิ้งเหมือน "ไม่มีสิทธิ์" เดิม · เรียกตรง (tools/[name]) = 403 key_not_general
import { isGeneralApiKey } from "@/lib/api-keys/route-auth";
import { accountToolScope } from "@/lib/ai/account-ops";
import { kanbanToolScope } from "@/lib/ai/kanban-ops";
import { memberToolScope } from "@/lib/modules/member/api/tools";
import { crmApi } from "@/lib/modules/crm";

type KeyShape = { scopes: readonly string[]; systemId: string | null; scopesMalformed?: boolean };

/** เครื่องมือนี้อยู่ในทะเบียน scope ของโมดูลใดโมดูลหนึ่งไหม */
export function isModuleScopedTool(toolName: string): boolean {
  return (
    accountToolScope(toolName) !== null ||
    kanbanToolScope(toolName) !== null ||
    memberToolScope(toolName) !== null ||
    crmApi.crmToolScope(toolName) !== null
  );
}

/** ด่านเพิ่มจาก scope เดิม: เครื่องมือนอกโมดูล = คีย์กลางเท่านั้น (เครื่องมือของโมดูล = ผ่านด่านนี้เสมอ) */
export function generalToolGate(toolName: string, key: KeyShape): boolean {
  return isModuleScopedTool(toolName) || isGeneralApiKey(key);
}
// ◂ HF-APIV1
