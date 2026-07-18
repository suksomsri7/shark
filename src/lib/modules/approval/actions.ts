"use server";

// Approval Engine v1 (WO-0049) — server actions ฝั่งร้าน (ตั้งกฎ + ตัดสินคำขอ)
// tenantId + userId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// assertCan: approval.policy.create/update (ตั้งกฎ) · approval.request.decide (อนุมัติ/ปฏิเสธ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { createPolicy, updatePolicy, setPolicyActive, decide, bulkDecide, cancelRequest } from "./service";

const SETTINGS_PATH = "/app/settings/approval";
const APPROVALS_PATH = "/app/approvals";

const ENTITY_TYPES = new Set(["PurchaseOrder", "HrLeave"]);
const ROLES = new Set(["MANAGER", "OWNER"]);

function ctxOf(auth: Awaited<ReturnType<typeof requireTenant>>) {
  return { tenantId: auth.active.tenantId };
}

function membershipOf(auth: Awaited<ReturnType<typeof requireTenant>>): MembershipCtx & { userId: string } {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
    userId: auth.active.userId,
  };
}

export type CreatePolicyState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

// สร้างสายอนุมัติจากฟอร์ม — วงเงิน(บาท→สตางค์) + ขั้นอนุมัติ 1-2 ขั้น (role ตามลำดับ)
export async function createPolicyAction(
  _prev: CreatePolicyState,
  formData: FormData,
): Promise<CreatePolicyState> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "approval", action: "approval.policy.create" });

  const name = String(formData.get("name") ?? "").trim();
  const entityType = String(formData.get("entityType") ?? "").trim();
  const minBahtRaw = String(formData.get("minBaht") ?? "").trim();
  const role1 = String(formData.get("role1") ?? "").trim();
  const role2 = String(formData.get("role2") ?? "").trim();

  if (!name) return { status: "error", message: "กรุณาตั้งชื่อสายอนุมัติ" };
  if (!ENTITY_TYPES.has(entityType)) return { status: "error", message: "กรุณาเลือกชนิดเอกสาร" };
  if (!ROLES.has(role1)) return { status: "error", message: "กรุณาเลือกผู้อนุมัติขั้นที่ 1" };

  // วงเงินขั้นต่ำ: รับเป็นบาท → เก็บเป็นสตางค์ (Int) · เว้นว่าง = ทุกจำนวน
  let thresholdSatang: number | null = null;
  if (minBahtRaw !== "") {
    const baht = Number(minBahtRaw);
    if (!Number.isFinite(baht) || baht < 0) {
      return { status: "error", message: "วงเงินขั้นต่ำต้องเป็นตัวเลขไม่ติดลบ" };
    }
    thresholdSatang = Math.round(baht * 100);
  }

  const steps: { order: number; approverRole: "MANAGER" | "OWNER" }[] = [
    { order: 1, approverRole: role1 as "MANAGER" | "OWNER" },
  ];
  if (ROLES.has(role2)) steps.push({ order: 2, approverRole: role2 as "MANAGER" | "OWNER" });

  try {
    await createPolicy(ctxOf(auth), { name, entityType, thresholdSatang, steps });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }

  revalidatePath(SETTINGS_PATH);
  return { status: "ok" };
}

// แก้สายอนุมัติที่มีอยู่ — ชื่อ/วงเงิน/ขั้นอนุมัติ (แทน steps ทั้งชุด) · entityType คงเดิม
// การกระทำระดับตั้งกฎ maker-checker → จำกัดเฉพาะ OWNER (RESUME: policy.create/update ควร OWNER)
export async function updatePolicyAction(
  _prev: CreatePolicyState,
  formData: FormData,
): Promise<CreatePolicyState> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "approval", action: "approval.policy.update" });
  if (auth.active.role !== "OWNER") {
    return { status: "error", message: "เฉพาะเจ้าของร้านเท่านั้นที่แก้สายอนุมัติได้" };
  }

  const policyId = String(formData.get("policyId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const minBahtRaw = String(formData.get("minBaht") ?? "").trim();
  const role1 = String(formData.get("role1") ?? "").trim();
  const role2 = String(formData.get("role2") ?? "").trim();

  if (!policyId) return { status: "error", message: "ไม่พบสายอนุมัติที่จะแก้ไข" };
  if (!name) return { status: "error", message: "กรุณาตั้งชื่อสายอนุมัติ" };
  if (!ROLES.has(role1)) return { status: "error", message: "กรุณาเลือกผู้อนุมัติขั้นที่ 1" };

  let thresholdSatang: number | null = null;
  if (minBahtRaw !== "") {
    const baht = Number(minBahtRaw);
    if (!Number.isFinite(baht) || baht < 0) {
      return { status: "error", message: "วงเงินขั้นต่ำต้องเป็นตัวเลขไม่ติดลบ" };
    }
    thresholdSatang = Math.round(baht * 100);
  }

  const steps: { order: number; approverRole: "MANAGER" | "OWNER" }[] = [
    { order: 1, approverRole: role1 as "MANAGER" | "OWNER" },
  ];
  if (ROLES.has(role2)) steps.push({ order: 2, approverRole: role2 as "MANAGER" | "OWNER" });

  try {
    await updatePolicy(ctxOf(auth), policyId, { name, thresholdSatang, steps });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }

  revalidatePath(SETTINGS_PATH);
  return { status: "ok" };
}

// เปิด/ปิดสายอนุมัติ (ปุ่ม toggle ในแถว)
export async function togglePolicyAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "approval", action: "approval.policy.update" });
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await setPolicyActive(ctxOf(auth), id, active);
  revalidatePath(SETTINGS_PATH);
}

// อนุมัติ/ไม่อนุมัติคำขอ (ปุ่มในหน้า "รออนุมัติของฉัน")
export async function decideAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "approval", action: "approval.request.decide" });
  const requestId = String(formData.get("requestId") ?? "");
  const rawDecision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!requestId || (rawDecision !== "APPROVED" && rawDecision !== "REJECTED")) return;
  await decide(membershipOf(auth), ctxOf(auth), requestId, { decision: rawDecision, note });
  revalidatePath(APPROVALS_PATH);
}

// อนุมัติ/ปฏิเสธหลายคำขอพร้อมกัน (checkbox หลายรายการ) — สิทธิ์เดียวกับตัดสินรายใบ
// คืนสรุปผลให้ useActionState แสดง inline (สำเร็จ N · ล้มเหลว M พร้อมเหตุผล)
export type BulkDecideState =
  | { status: "idle" }
  | { status: "done"; done: number; failed: { id: string; reason: string }[] }
  | { status: "error"; message: string };

export async function bulkDecideAction(
  _prev: BulkDecideState,
  formData: FormData,
): Promise<BulkDecideState> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "approval", action: "approval.request.decide" });

  const requestIds = formData.getAll("requestIds").map(String).filter(Boolean);
  const rawDecision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (rawDecision !== "APPROVED" && rawDecision !== "REJECTED") {
    return { status: "error", message: "การตัดสินไม่ถูกต้อง" };
  }
  if (requestIds.length === 0) return { status: "error", message: "กรุณาเลือกอย่างน้อย 1 คำขอ" };
  if (rawDecision === "REJECTED" && !note) {
    return { status: "error", message: "กรุณาระบุเหตุผลที่ไม่อนุมัติ" };
  }

  const res = await bulkDecide(membershipOf(auth), ctxOf(auth), requestIds, rawDecision, note);
  revalidatePath(APPROVALS_PATH);
  return { status: "done", done: res.done, failed: res.failed };
}

// ผู้ยื่นยกเลิกคำขอของตัวเอง (หน้า "คำขอของฉัน") — เฉพาะที่ตัวเองยื่น + ยัง PENDING
export async function cancelMyRequestAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return;
  const ctx = ctxOf(auth);
  // ownership: ยกเลิกได้เฉพาะคำขอที่ตัวเองเป็นผู้ยื่น (กันยกเลิกของคนอื่น)
  const req = await tenantDb(ctx).approvalRequest.findFirst({ where: { id: requestId } });
  if (!req || req.requestedById !== auth.active.userId) return;
  await cancelRequest(ctx, requestId);
  revalidatePath(APPROVALS_PATH);
}
