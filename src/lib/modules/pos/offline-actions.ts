"use server";
// offline-actions.ts — server action ของงานออฟไลน์ฝั่งจอ (POS P3.4U · มติผู้คุม 9 10 · CD-P34U-4) // POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   เปลือกบาง: session → ctx/actor → offline-sync (คิวผู้จัดการ: รายการ · รับบิล · ทิ้งบิล) / settings-general (สวิตช์ออฟไลน์ของเจ้าของร้าน)
//   การซิงก์บิลและการดึง snapshot ไม่อยู่ที่นี่ — ใช้ route ของ session (/api/pos/sync · /api/pos/sync/snapshot) ที่ URL คงที่ข้าม deploy
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message} (ไม่โยน) · ทุกตัวมี catch (qc-pos-p1.6 R2)
// 🔴 ร้าน + บทบาท + สิทธิ์มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน facade (ระบบ POS ของร้าน · สาขา · pos.shift.manage · OWNER)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { acceptOfflineSale, discardOfflineSale, listOfflineRejected, type OfflineAcceptResult, type OfflineDiscardResult, type OfflineRejectedResult } from "./offline-sync";
import { updatePosOfflineEnabled, type PosOfflineEnabledResult } from "./settings-general";
import type { RegisterActor } from "./register-shared";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

async function session(): Promise<{ tenantId: string; actor: RegisterActor; role: string; m: ReturnType<typeof posMembership> }> {
  const auth = await requireTenant();
  const m = posMembership(auth.active);
  const role = m.role === "OWNER" || m.role === "MANAGER" ? m.role : "STAFF";
  return { tenantId: auth.active.tenantId, role: m.role, m, actor: { userId: auth.user.id, role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
/** ด่านแรกระดับร้าน (F6.1) — ด่านจริงต่อสาขา/บทบาทอยู่ใน facade/ตัวเขียน */
function gate(m: ReturnType<typeof posMembership>, action: string): boolean {
  try {
    assertCan(m, { module: "pos", action });
    return true;
  } catch {
    return false;
  }
}
const DENIED = { ok: false as const, code: "PERMISSION_DENIED" as const, message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้" };
function unexpected(where: string, e: unknown): { ok: false; code: "UNKNOWN"; message: string } {
  console.error(`[pos/offline-actions] ${where}`, e);
  return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** CD-P34U-4: บิลออฟไลน์ที่ถูกปฏิเสธของสาขา (หน้ากะ · pos.shift.manage) */
export async function listOfflineRejectedAction(args: { systemId: string; unitId: string; limit?: number }): Promise<OfflineRejectedResult> {
  try {
    const s = await session();
    if (!gate(s.m, "pos.shift.manage")) return DENIED;
    return await listOfflineRejected({ tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId) }, s.actor, { limit: typeof args?.limit === "number" ? args.limit : 50 });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("listOfflineRejected", e);
  }
}

/** CD-P34U-4: ผู้จัดการรับบิล (ตรวจซ้ำทุกด่านที่ facade · ซ้ำได้) */
export async function acceptOfflineSaleAction(args: { systemId: string; unitId: string; id: string }): Promise<OfflineAcceptResult> {
  try {
    const s = await session();
    if (!gate(s.m, "pos.shift.manage")) return DENIED;
    return await acceptOfflineSale({ tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId) }, s.actor, { id: str(args?.id) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("acceptOfflineSale", e);
  }
}

/** CD-P34U-4: ผู้จัดการทิ้งบิล (เหตุผล ≥ 5 ตัวอักษร · ตรวจซ้ำที่ facade · ซ้ำได้) */
export async function discardOfflineSaleAction(args: { systemId: string; unitId: string; id: string; reason: string }): Promise<OfflineDiscardResult> {
  try {
    const s = await session();
    if (!gate(s.m, "pos.shift.manage")) return DENIED;
    return await discardOfflineSale({ tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId) }, s.actor, { id: str(args?.id), reason: str(args?.reason) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("discardOfflineSale", e);
  }
}

/** มติ 10: สวิตช์ขายออฟไลน์ (เจ้าของร้านเท่านั้น — ตัวเขียนตรวจ OWNER ซ้ำ) */
export async function updatePosOfflineEnabledAction(args: { systemId: string; enabled: boolean }): Promise<PosOfflineEnabledResult> {
  try {
    const s = await session();
    if (!gate(s.m, "pos.settings.manage")) return DENIED;
    return await updatePosOfflineEnabled({ tenantId: s.tenantId, systemId: str(args?.systemId) }, { userId: s.actor.userId, role: s.role, unitAccess: s.actor.unitAccess, permissions: s.actor.permissions }, { enabled: args?.enabled });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("updatePosOfflineEnabled", e);
  }
}
