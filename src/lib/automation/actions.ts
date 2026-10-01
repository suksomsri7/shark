"use server";

// Automation v1 (WO-0026) — server actions ฝั่งร้าน (UI ตั้งค่า/ศูนย์แจ้งเตือน)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client (กันร้านปลอมเป็นอีกร้าน)

import { revalidatePath } from "next/cache";
import type { AutomationActionType } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import {
  canManageShopAutomation,
  createRule,
  deleteRule,
  markNotificationRead,
  setRuleEnabled,
} from "./service";
import { AUTOMATION_EVENTS } from "./labels";

const SETTINGS_PATH = "/app/settings/automation";
const NOTIFICATIONS_PATH = "/app/notifications";

/** 🔴 HOTFIX 2026-10-01: สิทธิ์ตั้งกฎของร้าน (OWNER/MANAGER หรือ STAFF ที่มี `automation.rule.create`) — ด่านเดียวกับข้อเสนอ AI */
function mayManage(auth: Awaited<ReturnType<typeof requireTenant>>): boolean {
  return canManageShopAutomation({
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  });
}

export type CreateRuleState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

// สร้างกติกาอัตโนมัติจากฟอร์ม (event + เงื่อนไขยอด(บาท→สตางค์) + action)
export async function createRuleAction(
  _prev: CreateRuleState,
  formData: FormData,
): Promise<CreateRuleState> {
  const auth = await requireTenant();
  if (!mayManage(auth)) return { status: "error", message: "บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งกฎอัตโนมัติ — ขอสิทธิ์ \"สร้าง/แก้กฎอัตโนมัติ\" จากเจ้าของร้านก่อน" };

  const name = String(formData.get("name") ?? "").trim();
  const event = String(formData.get("event") ?? "").trim();
  const actionType = String(formData.get("actionType") ?? "").trim() as AutomationActionType;
  const minBahtRaw = String(formData.get("minBaht") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!name) return { status: "error", message: "กรุณาตั้งชื่อกติกา" };
  if (!AUTOMATION_EVENTS.some((e) => e.value === event)) {
    return { status: "error", message: "กรุณาเลือกเหตุการณ์ที่จะให้ทำงาน" };
  }
  if (actionType !== "NOTIFY" && actionType !== "WEBHOOK") {
    return { status: "error", message: "กรุณาเลือกสิ่งที่จะให้ทำ" };
  }

  // เงื่อนไขยอดขั้นต่ำ: รับเป็นบาท → เก็บเป็นสตางค์ (Int) · เว้นว่าง = ทุกยอด
  let minAmountSatang: number | null = null;
  if (minBahtRaw !== "") {
    const baht = Number(minBahtRaw);
    if (!Number.isFinite(baht) || baht < 0) {
      return { status: "error", message: "ยอดขั้นต่ำต้องเป็นตัวเลขไม่ติดลบ" };
    }
    minAmountSatang = Math.round(baht * 100);
  }

  let actionConfig: unknown = {};
  if (actionType === "WEBHOOK") {
    if (!/^https?:\/\//i.test(url)) {
      return { status: "error", message: "กรุณากรอกที่อยู่เว็บฮุคที่ขึ้นต้นด้วย http:// หรือ https://" };
    }
    actionConfig = { url };
  } else {
    actionConfig = title ? { title } : {};
  }

  try {
    await createRule(
      { tenantId: auth.active.tenantId },
      { name, event, minAmountSatang, actionType, actionConfig },
    );
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }

  revalidatePath(SETTINGS_PATH);
  return { status: "ok" };
}

// เปิด/ปิดกติกา (ปุ่ม toggle ในแถว)
export async function toggleRuleAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id || !mayManage(auth)) return; // ไม่มีสิทธิ์ = ไม่ทำอะไร (หน้าโหลดใหม่ก็เห็นสถานะเดิม)
  await setRuleEnabled({ tenantId: auth.active.tenantId }, id, enabled);
  revalidatePath(SETTINGS_PATH);
}

// ลบกติกา (ผ่าน ConfirmDialog)
export async function deleteRuleAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!id || !mayManage(auth)) return;
  await deleteRule({ tenantId: auth.active.tenantId }, id);
  revalidatePath(SETTINGS_PATH);
}

// ทำเครื่องหมายอ่านแล้ว (ปุ่มในศูนย์แจ้งเตือน)
export async function markReadAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // ส่ง userId ด้วย — แจ้งเตือนที่จ่าหน้าถึงคนอื่น ต้องกดอ่านแทนกันไม่ได้ (G11)
  await markNotificationRead({ tenantId: auth.active.tenantId, userId: auth.user.id }, id);
  revalidatePath(NOTIFICATIONS_PATH);
}
