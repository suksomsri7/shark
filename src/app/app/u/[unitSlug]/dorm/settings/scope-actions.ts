"use server";

// SVC D.13 fix P5 ▸ ตั้งอาคารที่ผู้ดูแลแต่ละคนเห็น (#64) ทีละคน — อ่าน-แก้-เขียนฝั่งเซิร์ฟเวอร์ใน tx เดียว (บันทึกพร้อมกันไม่ทับกัน)
//   ร้าน/ผู้กระทำมาจาก session เท่านั้น (requireUnit) · เจ้าของเท่านั้น (ตรวจซ้ำด้วย Membership สดใน setDormBuildingAssignment)
// 🔴 ไฟล์ "use server": export async function เท่านั้น
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { setDormBuildingAssignment } from "@/lib/modules/dorm";

export async function setDormBuildingAssignmentAction(unitSlug: string, input: unknown): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "DORM") return { ok: false, reason: "ไม่พบหอพักนี้" };
  if (auth.active.role !== "OWNER") return { ok: false, reason: "ตั้งอาคารที่ผู้ดูแลเห็นได้เฉพาะเจ้าของกิจการ" };
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const membershipId = typeof raw.membershipId === "string" ? raw.membershipId : "";
  const buildingIds = Array.isArray(raw.buildingIds) ? raw.buildingIds.filter((x): x is string => typeof x === "string").slice(0, 51) : [];
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const r = await setDormBuildingAssignment(actor, { tenantId: auth.active.tenantId }, { unitId: unit.id, membershipId, buildingIds });
  if (r.ok) refresh();
  return r;
}
