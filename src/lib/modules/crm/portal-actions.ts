"use server";

// portal-actions.ts — server actions ฝั่งพนักงานของพอร์ทัลลูกค้าองค์กร (ใบ C3.5): เชิญ · ถอนสิทธิ์ · ตัดสินคำขอ · ตั้งค่าพอร์ทัล
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ portal.ts / คอมโพเนนต์)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูกตรวจใหม่ในบริการ (ระบบ CRM ของร้านนี้จริง) — ไม่เชื่อ id จากหน้าจอ
// 🔴 ด่าน: uiVersion 2 (assertCrmV2) → คีย์ `crm.portal.manage` (assertCanCrm) → บริการตรวจซ้ำ (บริษัทที่มองเห็น · audit)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import { decideRequest, invite, revoke, savePortalSettings } from "./portal";
import { PortalError } from "./portal-shared";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof PortalError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.portal] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว — ลองใหม่อีกครั้ง" };
}

async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  assertCanCrm(actor, "crm.portal.manage");
  return { ctx, actor };
}

const companyPath = (systemId: string, companyId: string) => `/app/sys/${systemId}/crm/companies/${companyId}`;

/** เชิญผู้ติดต่อเข้าพอร์ทัล — คืนลิงก์เชิญ (แสดงครั้งเดียวให้พนักงานคัดลอกส่งเองได้ ถ้าลูกค้าไม่ได้รับอีเมล) */
export async function inviteToPortalAction(
  systemId: string,
  input: { companyId: string; contactId: string; role: string; loginMethods: string[] },
): Promise<Result<{ inviteUrl: string; emailed: boolean }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await invite(ctx, actor, { companyId: String(input?.companyId ?? ""), contactId: String(input?.contactId ?? ""), role: String(input?.role ?? ""), loginMethods: Array.isArray(input?.loginMethods) ? input.loginMethods.map(String) : null });
    revalidatePath(companyPath(systemId, String(input?.companyId ?? "")));
    return { ok: true, inviteUrl: r.inviteUrl, emailed: r.emailed };
  } catch (e) {
    return failOf(e);
  }
}

/** ถอนสิทธิ์พอร์ทัล — session ทุกใบของสิทธิ์นี้ใช้ไม่ได้ทันที */
export async function revokePortalAccessAction(systemId: string, companyId: string, accessId: string): Promise<Result<{ sessionsRevoked: number }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await revoke(ctx, actor, { accessId: String(accessId ?? "") });
    revalidatePath(companyPath(systemId, String(companyId ?? "")));
    return { ok: true, sessionsRevoked: r.sessionsRevoked };
  } catch (e) {
    return failOf(e);
  }
}

/** อนุมัติ/ไม่อนุมัติคำขอจากพอร์ทัลเอง (คำขอที่ยังรอ) */
export async function decidePortalRequestAction(systemId: string, companyId: string, requestId: string, approve: boolean): Promise<Result<{ status: string }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await decideRequest(ctx, actor, { requestId: String(requestId ?? ""), approve: approve === true });
    revalidatePath(companyPath(systemId, String(companyId ?? "")));
    return { ok: true, status: r.status };
  } catch (e) {
    return failOf(e);
  }
}

/** บันทึกตั้งค่าพอร์ทัลของระบบ (`settings.crm.portal`) */
export async function savePortalSettingsAction(
  systemId: string,
  input: { enabled: boolean; loginMethods: string[]; showDeals: boolean; allowIssue: boolean; issueBoardId: string | null },
): Promise<Result<Record<never, never>>> {
  try {
    const { ctx, actor } = await session(systemId);
    await savePortalSettings(ctx, actor, input);
    revalidatePath(`/app/sys/${systemId}/crm/settings/portal`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
