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
import { isPosFilterScope } from "@/lib/api-keys/scopes"; // POS P5.2 ▸ fix C ◂

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
 * POS P5.2 ▸ fix C (K3 · CD-P52-O2-2): คีย์กลาง (scope ว่าง ไม่ผูกระบบ) × เครื่องมือของ POS = ปฏิเสธที่ประตู `/api/v1/ai/*`
 * (เดิม CD-7 ให้คีย์กลางอ่าน sales_summary/sales_by_day ด้วย pos.report.view ทุกสาขา) · tools/[name] ตอบ 403 pos_scope_required ◂
 */
export function posToolNeedsPosKey(toolName: string, key: KeyShape): boolean {
  return isPosScopedTool(toolName) && isGeneralApiKey(key);
}
/** คีย์ที่มี scope ของ POS จริง (ไม่นับตัวกรองสาขา `pos.filter.unit:*`) · scope เสีย = ไม่มี */
function keyHasPosScope(key: KeyShape): boolean {
  return key.scopesMalformed !== true && key.scopes.some((s) => s.startsWith("pos.") && !isPosFilterScope(s));
}

/** ด่านเพิ่มจาก scope เดิม: เครื่องมือนอกโมดูล = คีย์กลางเท่านั้น (เครื่องมือของโมดูล = ผ่านด่านนี้เสมอ) */
export function generalToolGate(toolName: string, key: KeyShape): boolean {
  // POS P5.2 ▸ fix C: เครื่องมือของ POS = คีย์ที่มี scope ของ POS เท่านั้น (scope ของเครื่องมือตัดสินต่อที่ toolAllowedForApiKey) ·
  //   คีย์กลาง = ไม่ผ่าน (สารบัญไม่โฆษณา · tools/[name] ตอบ pos_scope_required ก่อนถึงนี่) · คีย์ของโมดูลอื่น = key_not_general เหมือนเดิม ◂
  if (isPosScopedTool(toolName)) return keyHasPosScope(key);
  return isModuleScopedTool(toolName) || isGeneralApiKey(key);
}
// ◂ HF-APIV1
