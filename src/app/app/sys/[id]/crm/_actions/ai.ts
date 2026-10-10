"use server";

// _actions/ai.ts — ทางเข้า server action ของ "ผู้ช่วย AI ในหน้า CRM" + ตัวเลือกห้องทีม + การ์ดลิงก์ดีลในห้องแชท (ใบ C3.4)
//   คอมโพเนนต์อยู่ที่ `src/components/crm/ai/…` (ด่าน F2.3 ห้าม components import โมดูล CRM ⇒ เรียกผ่านไฟล์นี้ — รูปเดียวกับ `_actions/calls.ts`)
//
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ห้าม export type/const — หน้า 500 ทั้งที่ build ผ่าน · Next 16)
// 🔴 tenantId + ตัวคนมาจาก session เสมอ · systemId จากหน้าเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ระบบ CRM ของร้านนี้ · uiVersion 2)
// 🔴 กฎถาวร C1.11-S6.10: อ่านประตู `uiVersion` เองที่นี่ก่อนส่งต่อ (ด่านจริงครบทุกชั้นอยู่ในบริการ `crm/ai-bridges.ts`)
// 🔴 ไม่โยน error ดิบถึงหน้าจอ — คืน `{ ok:false, error }` ภาษาไทยที่ไม่โทษผู้ใช้ (แสดง inline ไม่ใช่ alert)

import { revalidateAndWake } from "@/lib/modules/crm/outbox-wake"; // CRM C5.4-D ▸ L3-M1b: รีเฟรชหน้า + ปลุกคิว outbox หลังเขียนสำเร็จ ◂
import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import { AiBridgeError, cancelProposal, confirmProposal, runAssist, setTeamRoom, unfurlDealLink } from "@/lib/modules/crm/ai-bridges";
import { isAssistKind } from "@/lib/modules/crm/ai-bridges-shared";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: "CRM_V2_DISABLED" };
  if (e instanceof AiBridgeError) return { ok: false, error: e.message, code: e.code };
  const code = typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string" ? String((e as { code: string }).code) : undefined;
  const msg = e instanceof Error ? e.message : "";
  if (code && /[ก-๙]/.test(msg)) return { ok: false, error: msg, code };
  // 🔴 ไม่ส่งรายละเอียดทางเทคนิค/ข้อมูลลูกค้าออกไป (log แค่ชนิด error — AUDIT-CLASS X8)
  console.error(`[crm.ai] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "ผู้ช่วย AI ทำรายการนี้ไม่สำเร็จ ระบบไม่ได้บันทึกอะไร — ลองใหม่อีกครั้ง" };
}

/** ปุ่ม AI 1 ครั้ง (deal/contact/company/home) — ผล = ข้อความจากโมเดล + (ถ้ามี) ตาราง/ข้อเสนอที่รอคนกดยืนยัน */
export async function runAssistAction(systemId: string, kind: string, targetId: string | null) {
  try {
    if (!isAssistKind(kind)) return { ok: false as const, error: "ไม่รู้จักปุ่มผู้ช่วย AI นี้ — รีเฟรชหน้าแล้วลองใหม่" };
    const { ctx, actor } = await session(systemId);
    const result = await runAssist(ctx, actor, { kind, id: targetId ?? null });
    return { ok: true as const, result };
  } catch (e) {
    return failOf(e);
  }
}

/** อนุมัติข้อเสนอของผู้ช่วย (ประตูเดียวของ CRM — สิทธิ์ + การมองเห็นของคนกด) · `edits` = สิ่งที่แก้ในการ์ดก่อนกด */
export async function confirmAssistProposalAction(systemId: string, proposalId: string, edits?: { nextStep?: string | null; dealIds?: string[] | null } | null) {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await confirmProposal(ctx, actor, String(proposalId ?? ""), { edits: edits ?? null });
    revalidateAndWake(`/app/sys/${ctx.systemId}`);
    return { ok: true as const, note: r.note };
  } catch (e) {
    return failOf(e);
  }
}

/** ยกเลิกข้อเสนอ — ได้เฉพาะคนที่ยืนยันได้ (addendum ข้อ 9) */
export async function cancelAssistProposalAction(systemId: string, proposalId: string) {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await cancelProposal(ctx, actor, String(proposalId ?? ""));
    return { ok: true as const, note: r.note };
  } catch (e) {
    return failOf(e);
  }
}

/** ผูกทีม → ห้องแชท (หน้าตั้งค่า CRM · คีย์ crm.settings.manage) · channelId ว่าง = เอาการผูกออก */
export async function setTeamRoomAction(systemId: string, teamId: string, channelId: string | null) {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await setTeamRoom(ctx, actor, { teamId: String(teamId ?? ""), channelId: channelId ? String(channelId) : null });
    revalidateAndWake(`/app/sys/${ctx.systemId}/crm/settings`);
    return { ok: true as const, teamRooms: r.teamRooms };
  } catch (e) {
    return failOf(e);
  }
}

/**
 * การ์ดลิงก์ดีลในห้องแชท (addendum ข้อ 11) — ผู้ดู = คนที่เปิดห้องอยู่ (session) · ร้าน = ร้านของ session
 * ไม่ใช่ลิงก์ดีล / ร้านอื่น / มองไม่เห็น = `null` (ไม่บอกว่ามีอยู่) · ระบบ CRM ปลายทางถูกตรวจประตู v2 ในบริการ
 */
export async function unfurlDealLinksAction(urls: string[]) {
  // รีวิว C3.4 N5: หนึ่งคำขอต่อข้อความ (ลิงก์ไม่เกิน 3 · ตัดซ้ำ) — ไม่ยิง action แยกทีละลิงก์ · ผลเรียงตามลิงก์ (null = ไม่แสดง)
  try {
    const auth = await requireTenant();
    const actor = toMemberActor(auth.user.id, auth.active);
    const list = [...new Set((Array.isArray(urls) ? urls : []).map((u) => String(u ?? "").slice(0, 500)).filter(Boolean))].slice(0, 3);
    const out = [];
    for (const u of list) out.push(await unfurlDealLink({ tenantId: auth.active.tenantId }, actor, u));
    return out;
  } catch {
    return [];
  }
}
