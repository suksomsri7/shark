"use server";

// PDPA — server actions ฝั่งร้าน (WO-0042)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// เฉพาะ OWNER: export ข้อมูล + ขอลบร้าน/ยกเลิก (การกระทำระดับทำลายทั้งร้าน)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import {
  exportTenantData,
  requestTenantDeletion,
  cancelTenantDeletion,
} from "@/lib/platform/pdpa";

const PRIVACY_PATH = "/app/settings/privacy";

// บังคับ OWNER — MANAGER/STAFF ห้ามแตะ (โยนถ้าไม่ใช่)
async function requireOwner() {
  const auth = await requireTenant();
  if (auth.active.role !== "OWNER") {
    throw new Error("เฉพาะเจ้าของร้าน (OWNER) เท่านั้นที่ทำรายการนี้ได้");
  }
  return auth;
}

export type ExportResult =
  | { ok: true; json: string; filename: string }
  | { ok: false; error: string };

// ดาวน์โหลดข้อมูลร้านทั้งหมดเป็น JSON (client รับ json แล้วสร้างไฟล์ให้โหลด)
export async function exportMyDataAction(): Promise<ExportResult> {
  try {
    const auth = await requireOwner();
    const json = await exportTenantData(auth.active.tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    return { ok: true, json, filename: `shark-export-${auth.active.tenant.slug}-${stamp}.json` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ดาวน์โหลดข้อมูลไม่สำเร็จ" };
  }
}

// ขอลบร้าน — เข้าสู่ช่วงรอ 30 วัน (ใช้เป็น form action ใน ConfirmDialog)
export async function requestDeleteAction(): Promise<void> {
  const auth = await requireOwner();
  await requestTenantDeletion(auth.active.tenantId);
  revalidatePath(PRIVACY_PATH);
}

// ยกเลิกคำขอลบร้าน — กลับมา ACTIVE ตามเดิม
export async function cancelDeleteAction(): Promise<void> {
  const auth = await requireOwner();
  await cancelTenantDeletion(auth.active.tenantId);
  revalidatePath(PRIVACY_PATH);
}
