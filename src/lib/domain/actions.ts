"use server";

// Custom Domain — server actions ฝั่งร้าน (WO-0025)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// สิทธิ์: เฉพาะ OWNER (เจ้าของร้าน) เท่านั้น — โดเมนกระทบทั้งร้าน

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { requestDomain, checkDomain, removeDomain } from "./service";

const SETTINGS_PATH = "/app/settings/domain";

export type DomainActionState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

// ตรวจว่าเป็น OWNER — ไม่ใช่ → โยนไทย
function assertOwner(role: string): void {
  if (role !== "OWNER") {
    throw new Error("เฉพาะเจ้าของร้าน (OWNER) เท่านั้นที่ตั้งค่าโดเมนได้");
  }
}

// ขอเชื่อมโดเมนใหม่
export async function requestDomainAction(
  _prev: DomainActionState,
  formData: FormData,
): Promise<DomainActionState> {
  const auth = await requireTenant();
  try {
    assertOwner(auth.active.role);
    const domain = String(formData.get("domain") ?? "").trim();
    if (!domain) return { status: "error", message: "กรุณากรอกชื่อโดเมน เช่น shop.example.com" };
    const r = await requestDomain({ tenantId: auth.active.tenantId }, domain);
    if (!r.ok) return { status: "error", message: r.error };
    revalidatePath(SETTINGS_PATH);
    return { status: "ok", message: "บันทึกโดเมนแล้ว — โปรดตั้งค่า DNS ตามขั้นตอนด้านล่าง" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ" };
  }
}

// ตรวจสถานะโดเมน (เรียก Vercel)
export async function checkDomainAction(
  _prev: DomainActionState,
  _formData: FormData,
): Promise<DomainActionState> {
  const auth = await requireTenant();
  try {
    assertOwner(auth.active.role);
    const { status } = await checkDomain({ tenantId: auth.active.tenantId });
    revalidatePath(SETTINGS_PATH);
    const msg: Record<string, string> = {
      ACTIVE: "โดเมนใช้งานได้แล้ว 🎉",
      VERIFYING: "กำลังตรวจสอบ — DNS อาจใช้เวลาแพร่กระจายสักครู่",
      PENDING_DNS: "ยังไม่พบการตั้งค่า DNS — โปรดตรวจ CNAME อีกครั้ง",
      FAILED: "ตรวจสอบไม่ผ่าน — โปรดตรวจการตั้งค่า DNS",
      NONE: "ยังไม่ได้ตั้งโดเมน",
    };
    return { status: "ok", message: msg[status] ?? "ตรวจสอบสถานะแล้ว" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "ตรวจสอบไม่สำเร็จ" };
  }
}

// ยกเลิกโดเมน (ใช้กับ ConfirmDialog — action รับ FormData ตรง ๆ)
export async function removeDomainAction(_formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertOwner(auth.active.role);
  await removeDomain({ tenantId: auth.active.tenantId });
  revalidatePath(SETTINGS_PATH);
}
