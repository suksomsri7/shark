"use server";
// pos-integrations-actions.ts — server actions ของแท็บ "การเชื่อมต่อระบบ SHARK" (P1.18 S · R7 R8) · เปลือกบาง: session → ctx/actor → pos-integrations.ts
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูลเสมอ
// 🔴 action ไม่ส่ง opts ของ posIntegrationCards (ตะขอทดสอบ — มติ 4) · ร้าน/บทบาท/สิทธิ์จาก SESSION เท่านั้น

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "@/lib/modules/pos/access";
import type { PosSettingsRefusal } from "@/lib/modules/pos/settings-shared";
import { posIntegrationCards, setPosAccountLink, type PosAccountLinkResult, type PosIntegrationCardsResult } from "./pos-integrations";

async function session() {
  const auth = await requireTenant();
  const m = posMembership(auth.active);
  return { tenantId: auth.active.tenantId, m, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
/** ด่านแรกระดับร้าน (F6.1) — ด่านจริงต่อสาขา/สิทธิ์เจ้าของระบบอยู่ใน pos-integrations.ts */
function gate(m: ReturnType<typeof posMembership>, actions: string[]): boolean {
  for (const action of actions) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      // ลองคีย์ถัดไป
    }
  }
  return false;
}
const DENIED: PosSettingsRefusal = { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูการเชื่อมต่อของหน้าขาย" };
const str = (v: unknown): string => (typeof v === "string" ? v : "");
function unexpected(where: string, e: unknown): PosSettingsRefusal {
  console.error(`[pos-integrations-actions] ${where}`, e);
  return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** R7 การ์ด 13 ระบบของสาขานี้ */
export async function posIntegrationCardsAction(args: { systemId: string; unitId: string }): Promise<PosIntegrationCardsResult> {
  try {
    const s = await session();
    if (!gate(s.m, ["pos.sale.create", "pos.settings.manage"])) return DENIED;
    return await posIntegrationCards({ tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId) }, s.actor, {}, undefined);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("cards", e);
  }
}

/** R8 สวิตช์ลงบัญชี (ปิดต้อง confirm:true) */
export async function setPosAccountLinkAction(args: { systemId: string; enabled: boolean; confirm?: boolean }): Promise<PosAccountLinkResult> {
  try {
    const s = await session();
    if (!gate(s.m, ["pos.settings.manage"])) return DENIED;
    return await setPosAccountLink({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, { enabled: args?.enabled, confirm: args?.confirm });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("accountLink", e);
  }
}
