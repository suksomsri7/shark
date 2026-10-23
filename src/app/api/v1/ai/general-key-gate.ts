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
import { posToolScope } from "@/lib/modules/pos/api/tools"; // POS P5.2 ▸ fix C (K3 · CD-P52-O2-2) ◂

type KeyShape = { scopes: readonly string[]; systemId: string | null; scopesMalformed?: boolean };

/** เครื่องมือนี้อยู่ในทะเบียน scope ของโมดูลใดโมดูลหนึ่งไหม */
export function isModuleScopedTool(toolName: string): boolean {
  return (
    accountToolScope(toolName) !== null ||
    kanbanToolScope(toolName) !== null ||
    memberToolScope(toolName) !== null ||
    crmApi.crmToolScope(toolName) !== null ||
    isPosScopedTool(toolName) // POS P5.2 ▸ fix C: เครื่องมือของทะเบียน POS ตัดสินด้วย scope ของคีย์ (คีย์ pos-read + pos.report.view เรียกได้) ◂
  );
}

/** POS P5.2 ▸ fix C (K3 · CD-P52-O2-2): เครื่องมือจากทะเบียน op ของ POS (sales_summary · sales_by_day · pos_* ที่มี op.action) ◂ */
export function isPosScopedTool(toolName: string): boolean {
  return posToolScope(toolName) !== null;
}

/**
 * POS P5.2 ▸ fix C (K3 · CD-P52-O2-2): เครื่องมือของ POS ต้องใช้คีย์ที่มี scope ของ POS — คีย์ที่ไม่มี scope เลย (คีย์กลาง · scope เสีย)
 * = ปฏิเสธที่ประตู `/api/v1/ai/*` (เดิม CD-7 ให้คีย์กลางอ่าน sales_summary/sales_by_day ด้วย pos.report.view ทุกสาขา) ◂
 */
export function posToolNeedsPosKey(toolName: string, key: KeyShape): boolean {
  return isPosScopedTool(toolName) && (key.scopes.length === 0 || key.scopesMalformed === true);
}

/** ด่านเพิ่มจาก scope เดิม: เครื่องมือนอกโมดูล = คีย์กลางเท่านั้น (เครื่องมือของโมดูล = ผ่านด่านนี้เสมอ) */
export function generalToolGate(toolName: string, key: KeyShape): boolean {
  if (posToolNeedsPosKey(toolName, key)) return false; // POS P5.2 ▸ fix C (สารบัญ skills ไม่โฆษณา · tools/[name] ตอบ 403 ของตัวเองก่อนถึงนี่) ◂
  return isModuleScopedTool(toolName) || isGeneralApiKey(key);
}
// ◂ HF-APIV1
