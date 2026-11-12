"use server";
// HR H4.4 ▸ server actions ของวงจรพนักงาน — ห่อบาง ๆ: ผู้กด = เซสชัน (requireTenant → hrViewerOf) · ไม่แตะ DB ในไฟล์นี้ · ไม่ส่งเวลาเอง ·
//   ด่านสิทธิ์/สาขา/ข้อความทั้งหมดอยู่ที่ hr/lifecycle.ts · ผลการกดกลับหน้าเดิมเป็น "รหัสสั้น" (?life=) แล้วหน้าแปลงจากรายการข้อความคงที่ (LIFE_MSG) ◂
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "./privacy";
import {
  acknowledgeReviewNote,
  addReviewNote,
  confirmProbation,
  lifeMsgCode,
  offboardEmployee,
  saveLifecyclePolicy,
  setTaskDone,
  startChecklist,
  type LifecyclePolicyPatch,
} from "./lifecycle";

const field = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const seg = (s: string) => encodeURIComponent(s);
const profilePath = (systemId: string, employeeId: string) => `/app/sys/${seg(systemId)}/hr/employees/${seg(employeeId)}`;
const settingsPath = (systemId: string) => `/app/sys/${seg(systemId)}/hr/settings`;
/** กลับหน้าเดิมพร้อมรหัสผล (redirect โยนเพื่อจบ action) */
function back(path: string, r: { ok: true } | { ok: false; reason: string }, okCode = "ok"): never {
  revalidatePath(path);
  redirect(`${path}?life=${encodeURIComponent(r.ok ? okCode : lifeMsgCode(r.reason))}#hr-life`);
}
/** แม่แบบจากช่องข้อความ: บรรทัดละ "รหัส | หัวข้อ | วันครบกำหนด" (บรรทัดว่างข้าม) — รูปแบบผิดส่งต่อให้ lifecycle ตอบข้อความคงที่ */
function templateOf(text: string): unknown {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => {
    const [key = "", label = "", due = "0"] = l.split("|").map((x) => x.trim());
    return { key, title: label, dueDays: due === "" ? 0 : Number(due) };
  });
}

/** สิ้นสุดการจ้าง — ฟอร์ม: systemId · employeeId · endDate · reason · note · revokeAccess (ติ๊ก = ถอนสิทธิ์แอป) */
export async function offboardEmployeeAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  await requireMembership(auth.active.tenantId);
  const systemId = field(formData, "systemId");
  const employeeId = field(formData, "employeeId");
  const r = await offboardEmployee({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), employeeId, {
    endDate: field(formData, "endDate") || null,
    reason: field(formData, "reason"),
    note: field(formData, "note") || null,
    revokeAccess: formData.get("revokeAccess") === "on",
  });
  // r2-1: ไม่ถอนสิทธิ์ตามที่เลือก ⇒ ข้อความผลบอกว่าเก็บสิทธิ์บัญชีไว้
  back(profilePath(systemId, employeeId), r, r.ok && r.accessKept ? "ok.kept" : "ok");
}

/** เพิ่มบันทึก/ตักเตือน/ประเมิน — ฟอร์ม: systemId · employeeId · kind · title · body · periodLabel · score · visibleToEmployee */
export async function addReviewNoteAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  await requireMembership(auth.active.tenantId);
  const systemId = field(formData, "systemId");
  const employeeId = field(formData, "employeeId");
  const vis = field(formData, "visibleToEmployee");
  const r = await addReviewNote({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), {
    employeeId,
    kind: field(formData, "kind"),
    title: field(formData, "title"),
    body: field(formData, "body"),
    periodLabel: field(formData, "periodLabel") || null,
    score: field(formData, "score") || null,
    visibleToEmployee: vis === "yes" ? true : vis === "no" ? false : null,
  });
  back(profilePath(systemId, employeeId), r);
}

/** ตัวพนักงานรับทราบบันทึกของตัวเอง (ติดตั้งในหน้า "ของฉัน" โดย H2.10 · Q8) — ตัวตนจากเซสชันเท่านั้น */
export async function acknowledgeReviewNoteAction(formData: FormData): Promise<{ ok: true } | { ok: false; reason: string }> {
  const auth = await requireTenant();
  const m = await requireMembership(auth.active.tenantId);
  const r = await acknowledgeReviewNote({ tenantId: m.tenantId, userId: auth.user.id }, field(formData, "noteId"));
  if (r.ok) revalidatePath("/app");
  return r;
}

/** เริ่มรายการรับเข้า/ออกจากงานจากแม่แบบ — ฟอร์ม: systemId · employeeId · kind (ONBOARDING | OFFBOARDING) */
export async function startChecklistAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  await requireMembership(auth.active.tenantId);
  const systemId = field(formData, "systemId");
  const employeeId = field(formData, "employeeId");
  const r = await startChecklist({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), employeeId, field(formData, "kind"));
  back(profilePath(systemId, employeeId), r);
}

/** ติ๊ก/เลิกติ๊กรายการตรวจ — ฟอร์ม: systemId · employeeId (หน้าที่กลับไป) · taskId · done (1 | 0) */
export async function setTaskDoneAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  await requireMembership(auth.active.tenantId);
  const systemId = field(formData, "systemId");
  const r = await setTaskDone({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), field(formData, "taskId"), field(formData, "done") === "1");
  back(profilePath(systemId, r.ok ? r.employeeId : field(formData, "employeeId")), r);
}

/** ผ่านทดลองงาน — ฟอร์ม: systemId · employeeId */
export async function confirmProbationAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  await requireMembership(auth.active.tenantId);
  const systemId = field(formData, "systemId");
  const employeeId = field(formData, "employeeId");
  const r = await confirmProbation({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), employeeId);
  back(profilePath(systemId, employeeId), r);
}

/** ค่าตั้งวงจรพนักงาน (หน้าตั้งค่า) — ช่องที่ไม่มีในฟอร์ม = คงค่าเดิม · ช่องติ๊ก = true/false */
export async function saveLifecyclePolicyAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  await requireMembership(auth.active.tenantId);
  const systemId = field(formData, "systemId");
  const patch: LifecyclePolicyPatch = {
    probationLeadDays: field(formData, "probationLeadDays"),
    contractLeadDays: field(formData, "contractLeadDays"),
    assignTo: field(formData, "assignTo") || "UNIT_MANAGER",
    kanban: { enabled: formData.get("kanbanEnabled") === "on", boardId: field(formData, "boardId") || null },
    autoRevokePin: formData.get("autoRevokePin") === "on",
    revokeAppAccess: formData.get("revokeAppAccess") === "on",
    onboardingTemplate: templateOf(field(formData, "onboardingTemplate")),
    offboardingTemplate: templateOf(field(formData, "offboardingTemplate")),
  };
  const r = await saveLifecyclePolicy({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), patch);
  back(settingsPath(systemId), r);
}
