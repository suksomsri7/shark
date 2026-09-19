// access.ts — ตัวตัดสิน "คีย์สิทธิ์" ตัวเดียวของ CRM v2 (ใบ C1.7 · พิมพ์เขียว §6.1 · §6.4 · มติผู้คุมงาน C1.7 ข้อ 2–3)
//
// 🔴 ลำดับในทุกบริการ (สัญญาใบ C1.7): resolve ระบบ CRM ใหม่ → การมองเห็น (`visibility.ts` · มองไม่เห็น = NOT_FOUND) →
//    คีย์ (ไฟล์นี้ · เห็นแต่ไม่มีคีย์ = FORBIDDEN ข้อความไทยที่ไม่โทษผู้ใช้)
// 🔴 ต่างจาก `rbac.evaluate` ตรงไหน (จงใจ):
//    • MANAGER ไม่ได้ 5 คีย์ตั้งค่า (settings · api · object · visibility · team .manage) จนกว่าเจ้าของร้านให้เอง (§6.1)
//    • STAFF ที่ถือคีย์ `crm.*` ตัวใดก็ได้ = อ่านผู้ติดต่อ/ดีล/กิจกรรมได้โดยนัย (บทเรียน K3.1) — **เฉพาะคน**
//    • คีย์ API (actor ที่มี `apiRole`): สิทธิ์ = scope ของคีย์เท่านั้น ไม่มี "อ่านโดยนัย" ไม่อิงบทบาท (บทเรียน H1)
// 🔴 ไม่มีแคชใด ๆ — ตัดสินจาก actor ที่ผู้เรียกสร้างใหม่ทุกคำขอ (toMemberActor / memberActorForKey)
import type { MemberActor } from "@/lib/modules/member";
import { CRM_OWNER_ONLY_KEYS, permissionLabel } from "@/lib/core/permissions";
import { ForbiddenError } from "@/lib/core/rbac";

/** คีย์ที่ MANAGER ไม่ได้โดยปริยาย (§6.1) — ให้ได้รายคนผ่านหน้าสิทธิ์ของเจ้าของร้าน */
export const CRM_MANAGER_EXCLUDED: readonly string[] = CRM_OWNER_ONLY_KEYS;

/** read-โดยนัยของคน (ไม่ใช่คีย์ API): มีคีย์ `crm.*` ตัวใดก็ได้ = 3 คีย์นี้ */
export const CRM_IMPLICIT_READ: readonly string[] = ["crm.contact.read", "crm.deal.read", "crm.activity.read"];

const STAFF_DEFAULT: readonly string[] = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update",
  "crm.company.read", "crm.company.create", "crm.company.update",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.lines", "crm.deal.quote",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.send", "crm.email.read", "crm.sequence.enroll",
  "crm.record.read", "crm.record.create", "crm.record.update",
  "crm.report.view",
];

/** ทุกคีย์ของ §6.1 (ลำดับเดียวกับทะเบียน) — ใช้สร้างค่าเริ่มต้นของ MANAGER */
const ALL_KEYS: readonly string[] = [
  "crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.delete", "crm.contact.convert", "crm.contact.import", "crm.contact.export", "crm.contact.merge",
  "crm.company.read", "crm.company.create", "crm.company.update", "crm.company.delete", "crm.company.merge",
  "crm.deal.read", "crm.deal.create", "crm.deal.update", "crm.deal.move", "crm.deal.delete", "crm.deal.quote", "crm.deal.reassign", "crm.deal.lines", "crm.deal.forecast",
  "crm.activity.read", "crm.activity.create", "crm.activity.complete", "crm.activity.delete",
  "crm.email.read", "crm.email.send", "crm.email.settings",
  "crm.sequence.manage", "crm.sequence.enroll", "crm.automation.manage", "crm.score.manage", "crm.assignment.manage",
  "crm.object.manage", "crm.record.read", "crm.record.create", "crm.record.update", "crm.record.delete",
  "crm.team.manage", "crm.visibility.manage", "crm.quota.manage", "crm.commission.view", "crm.commission.approve",
  "crm.report.view", "crm.report.team", "crm.report.all",
  "crm.tracking.manage", "crm.portal.manage", "crm.settings.manage", "crm.api.manage",
];

/**
 * ค่าเริ่มต้นต่อบทบาทของ §6.1 (ชุด "แนะนำ" สำหรับหน้าตั้งสิทธิ์) — OWNER = ทุกคีย์ (ไม่ต้องมีรายการ)
 * MANAGER = ทุกคีย์ยกเว้น 5 คีย์ตั้งค่า (commission.approve คงไว้ · มีเพดาน `crm._maxCommissionApproveSatang`)
 */
export const CRM_ROLE_DEFAULTS: { readonly STAFF: readonly string[]; readonly MANAGER: readonly string[] } = {
  STAFF: STAFF_DEFAULT,
  MANAGER: ALL_KEYS.filter((k) => !CRM_MANAGER_EXCLUDED.includes(k)),
};

type ActorLike = (Pick<MemberActor, "role" | "permissions" | "apiRole"> & { unitAccess?: unknown }) | null | undefined;

/** actor นี้คือคีย์ API (ไม่ใช่คน) */
export function isApiActor(actor: ActorLike): boolean {
  return !!actor && typeof actor.apiRole === "string" && actor.apiRole.length > 0;
}

/** ถือคีย์ `crm.*` ตัวใดตัวหนึ่ง (true) ไหม — ไม่นับตัวกรอง `crm.filter.*` ของคีย์ API และค่าตัวเลข `crm._*` */
function hasAnyCrmKey(p: Record<string, unknown>): boolean {
  return Object.entries(p).some(([k, v]) => v === true && k.startsWith("crm.") && !k.startsWith("crm.filter.") && !k.startsWith("crm._"));
}

/**
 * AUDIT-CLASS X2: คีย์สิทธิ์ข้อนี้ผ่านไหม — ตัวตัดสินตัวเดียวของ CRM (บริการ · server action · หน้า)
 * OWNER ⇒ ทุกคีย์ · MANAGER ⇒ ทุกคีย์ยกเว้น 5 คีย์ตั้งค่า (เว้นแต่ได้รับชัดเจน) · STAFF ⇒ `permissions[key]` / `crm.*` / read-โดยนัย ·
 * คีย์ API ⇒ scope ของคีย์เท่านั้น (ไม่มี read-โดยนัย ไม่อิงบทบาท) · ลูกค้า (portal) ⇒ ไม่มีเลย
 */
export function crmCan(actor: ActorLike, key: string): boolean {
  if (!actor || actor.role === "CUSTOMER") return false;
  const p = (actor.permissions ?? {}) as Record<string, unknown>;
  const explicit = p[key] === true || p["crm.*"] === true;
  // AUDIT-CLASS X2: คีย์ API ไม่มี "อ่านโดยนัย" และไม่ได้สิทธิ์จากบทบาท (ADMIN = MANAGER ในรูป actor) — scope ล้วน
  if (isApiActor(actor)) return explicit;
  if (actor.role === "OWNER") return true;
  if (actor.role === "MANAGER") return explicit || !CRM_MANAGER_EXCLUDED.includes(key);
  if (explicit) return true;
  return CRM_IMPLICIT_READ.includes(key) && hasAnyCrmKey(p);
}

/** ค่าตัวเลขของสิทธิ์ (`crm._maxReassignPerDay` …) — ไม่มี/ไม่ใช่ตัวเลข = undefined (= ไม่จำกัด ตามผู้เรียก) */
export function crmParam(actor: ActorLike, key: string): number | undefined {
  const v = actor?.permissions?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** ข้อความไทยของ "เห็นแต่ไม่มีคีย์" — บอกว่าขาดสิทธิ์อะไรและต้องทำอะไรต่อ ไม่โทษผู้ใช้ ไม่สะท้อนข้อมูลของระเบียน */
export function crmForbiddenMessage(key: string): string {
  const label = permissionLabel(key);
  return `บัญชีนี้ยังไม่ได้รับสิทธิ์ "${label === key ? "ทำรายการนี้" : label}" ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง`;
}

/**
 * error "ไม่มีสิทธิ์" ของ CRM (code FORBIDDEN) — ใช้ใน server action/หน้า · สืบจาก `ForbiddenError` ของ rbac
 * ⇒ `failOf` เดิมของทุก action (instanceof ForbiddenError) แปลงเป็น `{ ok:false, code:"FORBIDDEN" }` ได้โดยไม่ต้องแก้
 */
export class CrmForbiddenError extends ForbiddenError {
  readonly code = "FORBIDDEN" as const;
  readonly status = 403;
  constructor(key: string) {
    super({ module: "crm", action: key });
    this.message = crmForbiddenMessage(key);
    this.name = "CrmForbiddenError";
  }
}

/** AUDIT-CLASS X2: โยน CrmForbiddenError เมื่อคีย์ไม่ผ่าน */
export function assertCanCrm(actor: ActorLike, key: string): void {
  if (!crmCan(actor, key)) throw new CrmForbiddenError(key);
}
