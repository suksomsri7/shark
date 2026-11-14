"use server";

// PDPA — server actions ฝั่งร้าน (WO-0042)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// เฉพาะ OWNER: export ข้อมูล + ขอลบร้าน/ยกเลิก (การกระทำระดับทำลายทั้งร้าน)

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth, requireTenant } from "@/lib/core/context";
import { destroySession } from "@/lib/core/session";
import {
  exportTenantData,
  requestTenantDeletion,
  cancelTenantDeletion,
} from "@/lib/platform/pdpa";
import { deleteAccount } from "@/lib/platform/account-deletion";
import { prisma } from "@/lib/core/db";
import { recordLegalAckInTx } from "@/lib/core/legal-ack";
import { unacknowledged } from "@/lib/core/settings/legal/warnings";
import { deletionRetentionWarnings } from "@/lib/pdpa/retention";

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

// ขอลบร้าน — เข้าสู่ช่วงรอ 30 วัน
// ACC T4.5 ▸ สมุดที่ยังไม่ครบระยะเก็บเอกสาร = คำเตือน SHOP_DELETE_WITHIN_RETENTION ต้องติ๊กรับทราบ (ไม่บล็อก) · บันทึกผู้ยืนยัน + log การลบ ◂
export async function requestDeleteAction(formData?: FormData): Promise<void> {
  const auth = await requireOwner();
  const tenantId = auth.active.tenantId;
  const { warnings, books } = await deletionRetentionWarnings(tenantId);
  const acked = [...(formData?.getAll("ack") ?? []).map(String), ...String(formData?.get("acks") ?? "").split(",")].map((x) => x.trim()).filter(Boolean);
  if (unacknowledged(warnings, acked).length > 0) redirect(`${PRIVACY_PATH}?err=${encodeURIComponent("ติ๊กรับทราบคำเตือนเรื่องการเก็บเอกสารก่อนขอลบร้าน")}`);
  const ackWarnings = warnings.filter((w) => w.ack);
  if (ackWarnings.length > 0) {
    await prisma.$transaction((tx) =>
      recordLegalAckInTx(tx, { tenantId, ack: { codes: acked, actorId: auth.user.id, actorType: "USER", via: "screen" }, op: "tenant.delete.request", targetType: "Tenant", targetId: tenantId, warnings: ackWarnings }),
    );
  }
  await requestTenantDeletion(tenantId, {
    userId: auth.user.id,
    detail: { acknowledged: ackWarnings.map((w) => w.code), books: books.map((b) => ({ systemId: b.systemId, name: b.name, lastEntryDate: b.lastEntryDate, keepUntil: b.keepUntil, exportedAt: b.exportedAt })) },
  });
  revalidatePath(PRIVACY_PATH);
}

// ยกเลิกคำขอลบร้าน — กลับมา ACTIVE ตามเดิม
export async function cancelDeleteAction(): Promise<void> {
  const auth = await requireOwner();
  await cancelTenantDeletion(auth.active.tenantId, auth.user.id); // ACC T4.5 ▸ log การลบ ◂
  revalidatePath(PRIVACY_PATH);
}

// ── ลบบัญชีผู้ใช้ (App Store 5.1.1(v)) — คนละเรื่องกับลบร้านด้านบน ──
// 🔴 ทุกคนที่ล็อกอินอยู่ทำได้ ไม่ใช่แค่ OWNER (พนักงานก็ต้องลบตัวตนตัวเองได้)
//    userId มาจาก session เท่านั้น (requireAuth) — ห้ามรับจาก client เด็ดขาด
export async function deleteMyAccountAction(): Promise<void> {
  const auth = await requireAuth();
  const res = await deleteAccount(auth.user.id);
  if (!res.ok) throw new Error(res.reason);
  await destroySession(); // session ถูก cascade ไปแล้ว — ล้าง cookie ค้างในเบราว์เซอร์ด้วย
  redirect("/?deleted=1");
}
