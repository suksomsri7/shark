"use server";
// settings-actions.ts — server actions ของหน้าตั้งค่า POS (P1.18 S) · เปลือกบาง: session → ctx/actor → settings-general / settings-overview / payment-settings
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ settings-shared.ts / settings-overview.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + บทบาท + สิทธิ์มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำในตัวเขียน/ตัวอ่าน

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { posSettingsHistory, updatePosDiscountCaps, updatePosGeneralSettings, updatePosUnitStockPolicy } from "./settings-general";
import { posSettingsOverview, posStaffOverview, type PosSettingsOverviewResult, type PosStaffOverviewResult } from "./settings-overview";
import { updatePosUnitPromptpay, type PosUnitPromptpayResult } from "./payment-settings";
import type { PosDiscountCapsResult, PosGeneralSettingsResult, PosSettingsHistoryResult, PosSettingsRefusal, PosUnitStockPolicyResult } from "./settings-shared";

async function session() {
  const auth = await requireTenant();
  const m = posMembership(auth.active);
  return { tenantId: auth.active.tenantId, m, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
/** ด่านแรกระดับร้าน (F6.1): ผ่านถ้ามีอย่างน้อยหนึ่งคีย์ · ด่านจริงต่อสาขา/ทุกสาขาอยู่ในตัวเขียน/ตัวอ่าน */
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
const DENIED: PosSettingsRefusal = { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าหน้าขาย" };
const MANAGE = ["pos.settings.manage"];
const str = (v: unknown): string => (typeof v === "string" ? v : "");
function unexpected(where: string, e: unknown): PosSettingsRefusal {
  console.error(`[pos/settings-actions] ${where}`, e);
  return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** R2 ภาพรวมค่าตั้ง (แท็บทั่วไป) */
export async function posSettingsOverviewAction(args: { systemId: string; unitId: string }): Promise<PosSettingsOverviewResult> {
  try {
    const s = await session();
    if (!gate(s.m, ["pos.sale.create", "pos.settings.manage"])) return DENIED;
    return await posSettingsOverview({ tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId) }, s.actor, {});
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("overview", e);
  }
}

/** R3 แก้ค่าตั้งทั่วไป */
export async function updatePosGeneralSettingsAction(args: { systemId: string; patch: unknown }): Promise<PosGeneralSettingsResult> {
  try {
    const s = await session();
    if (!gate(s.m, MANAGE)) return DENIED;
    return await updatePosGeneralSettings({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, args?.patch);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("general", e);
  }
}

/** R4 แก้เพดานส่วนลด */
export async function updatePosDiscountCapsAction(args: { systemId: string; patch: unknown }): Promise<PosDiscountCapsResult> {
  try {
    const s = await session();
    if (!gate(s.m, MANAGE)) return DENIED;
    return await updatePosDiscountCaps({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, args?.patch);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("caps", e);
  }
}

/** R5 นโยบายขายเกินสต็อกของสาขา */
export async function updatePosUnitStockPolicyAction(args: { systemId: string; unitId: string; oversellPolicy: string }): Promise<PosUnitStockPolicyResult> {
  try {
    const s = await session();
    if (!gate(s.m, MANAGE)) return DENIED;
    return await updatePosUnitStockPolicy({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, { unitId: args?.unitId, oversellPolicy: args?.oversellPolicy });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("unitStock", e);
  }
}

/** R9 ประวัติการเปลี่ยน (หน้าละ 20 · cursor จากหน้าก่อน) */
export async function posSettingsHistoryAction(args: { systemId: string; cursor?: string | null }): Promise<PosSettingsHistoryResult> {
  try {
    const s = await session();
    if (!gate(s.m, MANAGE)) return DENIED;
    return await posSettingsHistory({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, { cursor: args?.cursor ?? null });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("history", e);
  }
}

/** มติ Q9 เลขพร้อมเพย์รายสาขา (เจ้าของเท่านั้น · null = ลบ) */
export async function updatePosUnitPromptpayAction(args: { systemId: string; unitId: string; promptpayId: string | null }): Promise<PosUnitPromptpayResult> {
  try {
    const s = await session();
    if (!gate(s.m, ["pos.settings.payment", "pos.settings.manage"])) return { ok: false, code: "SETTINGS_SECTION_LOCKED", message: "เลขพร้อมเพย์เป็นปลายทางเงิน — เจ้าของร้านเท่านั้นที่ตั้งได้" };
    return await updatePosUnitPromptpay({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, {
      unitId: str(args?.unitId),
      // F4: ส่งค่าตามที่ได้รับ (ไม่แปลงเป็น null) — ค่าไม่ใช่ string ⇒ ตัวเขียนตอบ VALIDATION · null ที่ส่งมาตรง ๆ เท่านั้นที่ลบเลขของสาขา
      promptpayId: args?.promptpayId as string | null,
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("unitPromptpay", e);
  }
}

/** R10 แท็บพนักงานและสิทธิ์ของสาขา (pos.settings.manage ที่สาขา) */
export async function posStaffOverviewAction(args: { systemId: string; unitId: string }): Promise<PosStaffOverviewResult> {
  try {
    const s = await session();
    if (!gate(s.m, MANAGE)) return DENIED;
    return await posStaffOverview({ tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId) }, s.actor, {});
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("staff", e);
  }
}
