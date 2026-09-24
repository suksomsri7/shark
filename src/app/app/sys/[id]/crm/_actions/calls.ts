"use server";

// _actions/calls.ts — ทางเข้า server action ของ "บันทึกการโทร / ผู้ช่วย AI ของสาย / นามบัตร" ให้คอมโพเนนต์ฝั่ง client
//   (ใบ C2.4 · คอมโพเนนต์อยู่ที่ `src/components/crm/call/**`)
//
// 🔴 ทำไมต้องมีไฟล์นี้: ด่าน F2.3 ของ fitness ห้าม `src/components/**` import โมดูล CRM ตรง ๆ (แม้แต่ไฟล์ `*-shared`)
//    ⇒ คอมโพเนนต์เรียกผ่านไฟล์ใต้เส้นทางหน้า CRM ซึ่งเป็น "ตัวโมดูลเอง" ในสายตาด่านนั้น — รูปเดียวกับใบ C2.3
//    (`settings/assignment/actions.ts` ↔ `src/components/crm/assignment/**`)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ห้าม export type/const — ไม่งั้นหน้า 500 ทั้งที่ build ผ่าน)
// 🔴 กฎถาวร C1.11-S6.10: ทุกไฟล์ "use server" ของ CRM ต้องอ่านประตู `uiVersion` เอง ⇒ ที่นี่กันอีกชั้นก่อนส่งต่อ
//    (ด่านจริงครบทุกชั้น — ระบบของร้าน · การมองเห็น · คีย์ — อยู่ในบริการ `crm/calls.ts` เหมือนเดิม)

import { requireTenant } from "@/lib/core/context";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import {
  acceptCallAiAction as acceptCallAi,
  acceptLeadProposalAction as acceptLeadProposal,
  getRecordingAction as getRecording,
  logCallAction as logCall,
  removeRecordingAction as removeRecording,
  rejectCallAiAction as rejectCallAi,
  rejectLeadProposalAction as rejectLeadProposal,
  scanBusinessCardAction as scanBusinessCard,
  transcribeCallAction as transcribeCall,
} from "@/lib/modules/crm/calls-actions";

/** ประตูรุ่นหน้าจอ: ระบบที่ยังไม่เปิด CRM v2 (หรือไม่ใช่ระบบ CRM ของร้านนี้) = ปฏิเสธด้วยข้อความไทย ไม่แตะบริการเลย */
async function gate(systemId: string): Promise<{ ok: false; error: string; code: string } | null> {
  try {
    const auth = await requireTenant();
    await assertCrmV2({ tenantId: auth.active.tenantId, systemId: String(systemId ?? "") });
    return null;
  } catch (e) {
    if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
}

export async function logCallAction(systemId: string, form: FormData) {
  return (await gate(systemId)) ?? logCall(systemId, form);
}

export async function transcribeCallAction(systemId: string, activityId: string) {
  return (await gate(systemId)) ?? transcribeCall(systemId, activityId);
}

export async function acceptCallAiAction(
  systemId: string,
  proposalId: string,
  edits?: { transcript?: string | null; aiSummary?: string | null; aiNextStep?: string | null },
) {
  return (await gate(systemId)) ?? acceptCallAi(systemId, proposalId, edits);
}

export async function rejectCallAiAction(systemId: string, proposalId: string) {
  return (await gate(systemId)) ?? rejectCallAi(systemId, proposalId);
}

export async function removeRecordingAction(systemId: string, activityId: string, opts: { confirm?: boolean; reason?: string }) {
  return (await gate(systemId)) ?? removeRecording(systemId, activityId, opts);
}

export async function scanBusinessCardAction(systemId: string, form: FormData) {
  return (await gate(systemId)) ?? scanBusinessCard(systemId, form);
}

export async function acceptLeadProposalAction(systemId: string, proposalId: string) {
  return (await gate(systemId)) ?? acceptLeadProposal(systemId, proposalId);
}

/** ฟังไฟล์เสียงของสาย (ใบผ่าน 15 นาที ผูกกับผู้ดู) — ใบ C2.4 รอบ 2 ข้อ F4 */
export async function getRecordingAction(systemId: string, activityId: string) {
  return (await gate(systemId)) ?? getRecording(systemId, activityId);
}

/** ทิ้งผลอ่านนามบัตร (REJECTED + ล้าง PII) — ใบ C2.4 รอบ 2 ข้อ F8 */
export async function rejectLeadProposalAction(systemId: string, proposalId: string) {
  return (await gate(systemId)) ?? rejectLeadProposal(systemId, proposalId);
}
