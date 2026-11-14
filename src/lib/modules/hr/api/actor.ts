// actor.ts — "คีย์ API" ของระบบงานบุคคลกลายเป็นผู้อ่านของ HR ได้อย่างไร (ใบ H4.8 · brief R2 · มติ Q2 · มติ 14 พ.ย. ข้อ 4)
//
// สองแบบของผู้อ่าน (เลือกตามชนิดของตัวอ่านของ HR — brief F5):
//   1) ตัวอ่านที่ตัดสินจาก "ผู้ดูที่ส่งมา" (ตารางกะ · บอร์ดลงเวลา · โปรไฟล์ · ใบลา · ยอดวันลา · ค่าตั้ง) ⇒ ผู้ดูสังเคราะห์ต่อคีย์
//      `{ role: "STAFF", unitAccess: ["*"], permissions: scope ของคีย์ (ตัด hr.payroll.read), userId: "apikey:<keyId>" }`
//      ไม่ใช่คนจริง ⇒ ไม่มีแถว "ของตัวเอง" · ไม่มีวันเป็น MANAGER/OWNER · ไม่เห็นข้อมูลอ่อนไหว (seeSensitive ต้องมี hr.payroll.read)
//   2) ตัวอ่านที่อ่านสมาชิกภาพจริงจากฐาน (รายงาน · สลิป) ⇒ `hrIssuerViewer` = สมาชิกภาพปัจจุบันของผู้ออกคีย์ (createdById)
//      ใช้เฉพาะ ops/reports.ts + ops/payslips.ts · ผลผ่าน serializer แบบ allow-list ตาม scope ของคีย์เสมอ (มติ Q2)
// ด่านร่วมของทุก op (`assertHrIssuer` ใน op.ts): ผู้ออกคีย์ต้องยังเป็นเจ้าของร้านที่ยอมรับแล้ว — ไม่ใช่ = 403 forbidden (ข้อความคงที่)
// 🔴 คีย์ที่ไม่ได้ผูกระบบ HR นี้ (คีย์กลาง · คีย์ของระบบอื่น) ได้ actor ที่ `can()` เป็นเท็จทุกตัว ⇒ แกนตอบ 403 scope_missing
//    ไบต์เดียวกับคีย์ผูกระบบที่ไม่มี scope ของ HR (dispatch.ts เป็นผู้บอกว่าผูกหรือไม่)
import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import { ApiError, nothingWritten } from "@/lib/api/respond";
import { tenantDb } from "@/lib/core/db";
import { listRemovedEmployees } from "../service";

/** ข้อความไทยเมื่อคีย์ไม่มีสิทธิ์ทำ op ของระบบงานบุคคล */
export const HR_DENY_TH = "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบงานบุคคล";
/** ผู้ออกคีย์ไม่ได้เป็นเจ้าของร้านแล้ว (มติ Q2) — ข้อความคงที่ ไม่บอกชื่อ/บทบาท */
export const HR_ISSUER_FORBIDDEN_TH = "คีย์นี้ออกโดยผู้ที่ไม่ได้เป็นเจ้าของร้านแล้ว — ออกคีย์ใหม่";
const HR_ISSUER_FORBIDDEN_EN = "This key was issued by someone who is no longer the shop owner. Issue a new key.";
/** scope ที่ผู้ดูสังเคราะห์ไม่ถือ (ข้อมูลเงินเดือนอ่านผ่านผู้ออกคีย์ + serializer เท่านั้น) */
const NOT_ON_SYNTHETIC = new Set(["hr.payroll.read"]);

type ActorInput = { tenantId: string; systemId: string; keyId: string; keyName: string; scopes: string[]; createdById?: string | null; bound: boolean };
type IssuerRow = { role: string; unitAccess: unknown; permissions: unknown } | null;
type ActorExtra = { issuerId: string | null; bound: boolean; issuer?: Promise<IssuerRow> };

/** ข้อมูลที่แกนไม่มีช่องให้ (ผู้ออกคีย์ · ผูกระบบไหม) — ผูกกับ object ของ actor ต่อคำขอ */
const EXTRA = new WeakMap<ApiActor, ActorExtra>();

/** `ApiActor` ของแกน REST สำหรับคีย์ของระบบงานบุคคล — `bound` = คีย์ผูกระบบ HR ที่คำขอนี้ทำงานอยู่ */
export function hrApiKeyActor(input: ActorInput): ApiActor {
  const scopes = input.bound ? [...input.scopes] : [];
  const actor: ApiActor = {
    kind: "apikey",
    module: "hr",
    tenantId: input.tenantId,
    systemId: input.systemId,
    keyId: input.keyId,
    keyName: input.keyName,
    userId: null,
    scopes: [...input.scopes],
    membership: { ...membershipFromScopes(scopes), unitAccess: ["*"] },
    // STAFF ตรงตัว — scope ที่ไม่ได้ติ๊ก = ไม่มีสิทธิ์ · คีย์ไม่ผูกระบบนี้ = ไม่มีสิทธิ์ใดเลย
    can: (action) => input.bound && scopes.includes(action),
    denyMessageTh: HR_DENY_TH,
  };
  EXTRA.set(actor, { issuerId: input.createdById ?? null, bound: input.bound });
  return actor;
}

/** คีย์ถือ scope นี้ (และผูกระบบนี้) ไหม — ใช้ตรวจซ้ำใน handler (รายงานแต่ละชนิด · hr.leave.decide) */
export const hrKeyCan = (actor: ApiActor, scope: string): boolean => actor.can(scope);

/** ผู้ดูสังเคราะห์ของตัวอ่านแบบ "ตัดสินจากผู้ดูที่ส่งมา" */
export function hrKeyViewer(actor: ApiActor): { role: "STAFF"; unitAccess: string[]; permissions: Record<string, boolean>; userId: string } {
  const bound = EXTRA.get(actor)?.bound === true;
  const perms: Record<string, boolean> = {};
  if (bound) for (const s of actor.scopes) if (s.startsWith("hr.") && !NOT_ON_SYNTHETIC.has(s)) perms[s] = true;
  return { role: "STAFF", unitAccess: ["*"], permissions: perms, userId: `apikey:${actor.keyId ?? ""}` };
}

/** สมาชิกภาพปัจจุบันของผู้ออกคีย์ (อ่านครั้งเดียวต่อคำขอ) — ยอมรับแล้วเท่านั้น */
function issuerRow(actor: ApiActor): Promise<IssuerRow> {
  const x = EXTRA.get(actor);
  if (!x || !x.issuerId) return Promise.resolve(null);
  if (!x.issuer) {
    const issuerId = x.issuerId;
    x.issuer = tenantDb({ tenantId: actor.tenantId })
      .membership.findFirst({ where: { tenantId: actor.tenantId, userId: issuerId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } })
      .then((m) => (m ? { role: String(m.role), unitAccess: m.unitAccess, permissions: m.permissions } : null));
  }
  return x.issuer;
}

/** ด่านของทุก op: ผู้ออกคีย์ต้องยังเป็นเจ้าของร้าน (ยอมรับแล้ว) — ไม่ใช่ = 403 forbidden ข้อความคงที่ (ยังไม่เขียนอะไร) */
export async function assertHrIssuer(actor: ApiActor): Promise<void> {
  const m = await issuerRow(actor);
  if (!m || m.role !== "OWNER") throw nothingWritten(new ApiError(403, "forbidden", HR_ISSUER_FORBIDDEN_TH, HR_ISSUER_FORBIDDEN_EN));
}

/** user id ของผู้ออกคีย์ (ผู้ยื่นแทนของใบลาที่ยื่นผ่าน API) — ผ่าน assertHrIssuer แล้วเท่านั้น */
export function hrIssuerId(actor: ApiActor): string | null {
  return EXTRA.get(actor)?.issuerId ?? null;
}

/** ผู้ดูของตัวอ่านที่อ่านสมาชิกภาพจริงจากฐาน (รายงาน · สลิป) = ผู้ออกคีย์ · null = ไม่ใช่เจ้าของร้านที่ยอมรับแล้ว */
export async function hrIssuerViewer(actor: ApiActor): Promise<{ role: string; unitAccess: unknown; permissions: unknown; userId: string } | null> {
  const m = await issuerRow(actor);
  const uid = hrIssuerId(actor);
  if (!m || m.role !== "OWNER" || !uid) return null;
  return { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions, userId: uid };
}

/** user id ของคนที่ผูกกับพนักงาน เป็นเจ้าของร้าน (ยอมรับแล้ว) ไหม — ใบลาของเจ้าของร้านอนุมัติทันที (F6) จึงห้ามยื่นผ่าน API */
export async function isShopOwner(tenantId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const m = await tenantDb({ tenantId }).membership.findFirst({ where: { tenantId, userId, role: "OWNER", acceptedAt: { not: null } }, select: { id: true } });
  return !!m;
}

/** ประวัติการอ่านข้อมูลเงินเดือนผ่านคีย์ (R8 — id/ชนิด/งวดเท่านั้น ไม่มีชื่อ/ยอดเงิน) · เขียนไม่ได้ = โยน ⇒ ไม่ส่งข้อมูลออก (ปิดไว้ก่อน) */
export async function auditPayRead(actor: ApiActor, action: string, targetType: string, targetId: string, after: Record<string, string | number | null>): Promise<void> {
  await tenantDb({ tenantId: actor.tenantId }).auditLog.create({ data: { tenantId: actor.tenantId, actorType: "API_KEY", actorId: actor.keyId ?? null, action, targetType, targetId, after } });
}

/** พนักงานที่พ้นสภาพแล้ว (active=false) ของระบบนี้ — API รอบแรกซ่อนทุกที่ (มติรอบแก้ ข้อ 5): รายคน · การมาทำงาน · ใบลา · สลิป · ยื่นใบลา = 404 เหมือน id ที่ไม่มี */
const ENDED_CAP = 10_000;
export async function endedEmployeeIds(ctx: { tenantId: string; systemId: string }): Promise<Set<string>> {
  return new Set((await listRemovedEmployees(ctx, ENDED_CAP)).map((e) => e.id));
}
/** แถวพนักงาน (รูปใดก็ได้) พ้นสภาพแล้วไหม */
export const isEndedEmployee = (e: { active?: unknown; employmentStatus?: unknown } | null | undefined): boolean => !e || e.active === false || e.employmentStatus === "ENDED";
