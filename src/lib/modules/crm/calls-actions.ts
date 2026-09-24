"use server";

// calls-actions.ts — server actions ของโมดัล "บันทึกการโทร" + ผู้ช่วย AI ของสาย + นามบัตร (CRM v2 · ใบ C2.4)
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิด/ค่าคงที่อยู่ที่ `calls-shared.ts` — หน้า 'use client' ดึงจากที่นั่น)
// 🔴 tenantId มาจาก session เสมอ · systemId ที่หน้าส่งมาเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ต้องเป็นระบบ CRM ของร้านนี้)
// 🔴 ลำดับด่าน: requireTenant → `assertCanCrm` (คีย์) → `assertCrmV2` (ประตูรุ่นหน้าจอ) → บริการ (ซึ่งตรวจการมองเห็น + คีย์ซ้ำอีกชั้น)
// 🔴 ไม่โยน error ดิบถึงหน้าจอ — คืน `{ ok:false, error }` ภาษาไทยที่ไม่โทษผู้ใช้ (ช่องแจ้งแบบ inline ไม่ใช่ alert)
// 🔴 ไฟล์เสียง/รูปนามบัตรมาทาง `FormData` (ไม่ใช่ base64 ใน JSON): เสียง 25 MB ที่แปลง base64 จะบวมเป็น ~33 MB บนสาย

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import {
  acceptCallAiProposal,
  acceptLeadProposal,
  getRecording,
  logCall,
  removeRecording,
  rejectLeadProposal,
  scanBusinessCard,
  rejectCallAiProposal,
  transcribeCall,
  pendingCallAiProposal,
  type CallsCtx,
} from "./calls";
import { CallsError, type CallAiProposalView, type CardDraft, type LogCallInput, type RecordingDto, type RecordingUpload } from "./calls-shared";
// 🔴 ตัวแปลง "ระยะเวลาแบบคนพิมพ์" และ "เวลาไทยจากช่อง datetime-local" มีชุดเดียวของระบบ (C1.6) — หน้าจอส่งข้อความดิบมาให้แปลงที่นี่
//    (ห้ามทำสำเนาสูตรเวลาไทยไว้ในคอมโพเนนต์ 'use client' — ข้อที่เพี้ยนแล้วหาไม่เจอที่สุดคือเวลา)
import { parseDurationText, thaiLocalInputToIso } from "./activities-shared";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string, key: string): Promise<{ ctx: CallsCtx; actor: ReturnType<typeof toMemberActor> }> {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  // CRM C1.7 ▸ ด่านคีย์ผ่าน `crm/access.ts` (MANAGER ปริยาย · อ่านโดยนัยของคน · คีย์ API = scope ล้วน) ◂
  assertCanCrm(actor, key);
  const ctx: CallsCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  // CRM uiVersion gate ▸ action ของหน้า v2 ใช้ได้เฉพาะระบบที่เปิด CRM ใหม่ (settings.crm.uiVersion = 2) ◂
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CallsError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  // 🔴 ไม่ส่งรายละเอียดทางเทคนิค/ข้อมูลลูกค้าออกไป (log แค่ชนิด error — AUDIT-CLASS X8)
  console.error(`[crm.calls] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const txt = (form: FormData, k: string): string | null => {
  const v = form.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
/** "04:32" / "272" → วินาที · ว่าง = null · อ่านไม่ออก = โยน VALIDATION ไทย (ไม่เดาเป็น 0) */
const durationOf = (form: FormData): number | null => {
  const v = txt(form, "durationText");
  if (v === null) return null;
  const sec = parseDurationText(v);
  if (sec === null) return null;
  if (!Number.isFinite(sec)) throw new CallsError("VALIDATION", "ระยะเวลาอ่านไม่ออก — ใส่เป็นวินาที (272) หรือ นาที:วินาที (04:32)");
  return sec;
};
/** ค่าของช่อง `datetime-local` (เวลาไทย) → ISO · ว่าง = null · อ่านไม่ออก = โยน VALIDATION ไทย */
const localOf = (form: FormData, k: string, label: string): string | null => {
  const v = txt(form, k);
  if (v === null) return null;
  const iso = thaiLocalInputToIso(v);
  if (iso === "") throw new CallsError("VALIDATION", `${label}อ่านไม่ออก — เลือกวันและเวลาจากปฏิทินอีกครั้ง`);
  return iso;
};

/** ไฟล์จาก `<input type="file">` → ไบต์ (ไม่มีไฟล์/ว่าง = null) — ตัวตรวจชนิด/ขนาดตัวจริงอยู่ในบริการ */
async function fileOf(form: FormData, k: string): Promise<RecordingUpload | null> {
  const f = form.get(k);
  if (!f || typeof f === "string") return null;
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes.length === 0) return null;
  return { filename: f.name, contentType: f.type, data: bytes };
}

export async function logCallAction(
  systemId: string,
  form: FormData,
): Promise<{ ok: true; activityId: string; nextTaskId: string | null; hasRecording: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    const nextTitle = txt(form, "nextTaskTitle");
    const nextDue = localOf(form, "nextTaskDueLocal", "วันครบกำหนดของงานถัดไป");
    const input: LogCallInput = {
      contactId: txt(form, "contactId"),
      dealId: txt(form, "dealId"),
      companyId: txt(form, "companyId"),
      direction: txt(form, "direction") ?? "",
      outcome: txt(form, "outcome") ?? "",
      durationSec: durationOf(form),
      startAt: localOf(form, "startAtLocal", "เวลาที่คุย"),
      body: txt(form, "body"),
      remindAt: localOf(form, "remindAtLocal", "เวลาเตือน"),
      ...(nextTitle && nextDue ? { nextTask: { type: "TASK", title: nextTitle, dueAt: nextDue } } : {}),
      recording: await fileOf(form, "recording"),
    };
    const r = await logCall(ctx, actor, input);
    revalidatePath(`/app/sys/${systemId}/crm/activities`);
    return { ok: true, activityId: r.activity.id, nextTaskId: r.nextTaskId, hasRecording: !!r.recording };
  } catch (e) {
    return failOf(e);
  }
}

export async function transcribeCallAction(systemId: string, activityId: string): Promise<{ ok: true; proposal: CallAiProposalView | null; reused: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    const r = await transcribeCall(ctx, actor, activityId);
    return { ok: true, proposal: await pendingCallAiProposal(ctx, actor, activityId), reused: r.reused };
  } catch (e) {
    return failOf(e);
  }
}

export async function acceptCallAiAction(
  systemId: string,
  proposalId: string,
  edits?: { transcript?: string | null; aiSummary?: string | null; aiNextStep?: string | null },
): Promise<{ ok: true; activityId: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    const dto = await acceptCallAiProposal(ctx, actor, proposalId, edits ?? null);
    revalidatePath(`/app/sys/${systemId}/crm/activities`);
    return { ok: true, activityId: dto.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function rejectCallAiAction(systemId: string, proposalId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    await rejectCallAiProposal(ctx, actor, proposalId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function removeRecordingAction(systemId: string, activityId: string, opts: { confirm?: boolean; reason?: string }): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.create");
    await removeRecording(ctx, actor, activityId, { confirm: opts?.confirm === true, reason: opts?.reason ?? null });
    revalidatePath(`/app/sys/${systemId}/crm/activities`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/**
 * ลิงก์ฟังไฟล์เสียงของสายหนึ่ง (ใบ C2.4 รอบ 2 · ข้อ F4) — ใบผ่าน 15 นาทีที่ผูกกับ **ผู้ดูคนนี้**
 * 🔴 คีย์ที่ใช้คือคีย์ "อ่าน" (`crm.activity.read`) เพราะการฟังเสียงที่แนบอยู่แล้วคือการอ่านกิจกรรม ไม่ใช่การแก้
 * 🔴 ด่านการมองเห็นอยู่ในบริการและอยู่ **ก่อน** การออกใบผ่านเสมอ (กติกาหัวไฟล์ `/api/files/[id]`)
 */
export async function getRecordingAction(systemId: string, activityId: string): Promise<{ ok: true; recording: RecordingDto | null } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.activity.read");
    return { ok: true, recording: await getRecording(ctx, actor, activityId) };
  } catch (e) {
    return failOf(e);
  }
}

export async function scanBusinessCardAction(systemId: string, form: FormData): Promise<{ ok: true; proposalId: string; draft: CardDraft } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.create");
    const img = await fileOf(form, "card");
    if (!img) return { ok: false, error: "ยังไม่ได้เลือกรูปนามบัตร — ถ่ายรูปหรือเลือกไฟล์แล้วลองอีกครั้ง", code: "VALIDATION" };
    const r = await scanBusinessCard(ctx, actor, img);
    return { ok: true, proposalId: r.proposalId, draft: r.draft };
  } catch (e) {
    return failOf(e);
  }
}

export async function acceptLeadProposalAction(systemId: string, proposalId: string): Promise<{ ok: true; contactId: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.create");
    const r = await acceptLeadProposal(ctx, actor, proposalId);
    revalidatePath(`/app/sys/${systemId}/crm/contacts`);
    return { ok: true, contactId: r.contactId };
  } catch (e) {
    return failOf(e);
  }
}

/** ทิ้งผลอ่านนามบัตร (ใบ C2.4 รอบ 2 · ข้อ F8) — ปิดใบเป็น REJECTED และล้าง PII ออกจากแถวข้อเสนอ */
export async function rejectLeadProposalAction(systemId: string, proposalId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.contact.create");
    await rejectLeadProposal(ctx, actor, proposalId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
