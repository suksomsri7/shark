"use server";

// lost-reasons-actions.ts — server actions ของหน้าตั้งค่า "เหตุผลที่แพ้" (CRM v2 · ใบ C1.5)
// 🔴 "use server" = export ได้เฉพาะ async function · F6: assertCan `crm.settings.manage` · error ไทยที่ไม่โทษผู้ใช้

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import { createLostReason, updateLostReason, type LostReasonsCtx } from "./lost-reasons";
import { DealsError } from "./deals-shared";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string) {
  const auth = await requireTenant();
  assertCan(
    { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
    { module: "crm", action: "crm.settings.manage" },
  );
  const ctx: LostReasonsCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  // CRM uiVersion gate ▸ action ของหน้า v2 ใช้ได้เฉพาะระบบที่เปิด CRM ใหม่ (settings.crm.uiVersion = 2) — action v1 (`actions.ts`) ไม่ผ่านที่นี่ ◂
  await assertCrmV2(ctx);
  return { ctx, actor: toMemberActor(auth.user.id, auth.active) };
}

function failOf(e: unknown): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof DealsError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ตั้งค่า CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  console.error(`[crm.lost-reasons] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/lost-reasons`);

export async function createLostReasonAction(systemId: string, label: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await createLostReason(ctx, actor, { label });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateLostReasonAction(systemId: string, id: string, patch: { label?: string | null; active?: boolean | null }): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await updateLostReason(ctx, actor, id, patch);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
