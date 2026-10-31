"use server";
// SVC D.16 ▸ action มือถือช่าง (ซ่อมเสร็จ · แจ้งผู้เช่าทาง LINE) — ร้าน/ผู้กระทำมาจาก session เท่านั้น (requireUnit → auth.active)
//   ไม่รับรหัสร้าน/หน่วย/ผู้ใช้จากฟอร์ม · สิทธิ์ dorm.repair.manage + ขอบเขตอาคารตรวจสดใน facade ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND · ไม่ throw ให้ผู้ใช้เห็น stack
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { completeDormRepair, REPAIR_NF_REASON } from "@/lib/modules/dorm";

const NO_ACCESS = { ok: false as const, code: "NOT_FOUND" as const, reason: REPAIR_NF_REASON }; // ผู้ตรวจ F1: ไบต์เดียวกับ notFound() ของ facade
const BAD_INPUT = { ok: false as const, code: "INVALID_INPUT" as const, reason: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
const MAX_FILES = 8;

export async function completeRepairAction(unitSlug: string, repairId: string, prev: unknown, fd: FormData) {
  void prev;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return NO_ACCESS;
  if (!(fd instanceof FormData)) return BAD_INPUT;
  const afterPhotos = fd
    .getAll("afterPhotos")
    .filter((f): f is File => typeof f !== "string" && f.size > 0)
    .slice(0, MAX_FILES)
    .map((file) => ({ size: file.size, contentType: file.type || "application/octet-stream", read: () => file.arrayBuffer().then((b) => new Uint8Array(b)) }));
  const r = await completeDormRepair(
    { tenantId: auth.active.tenantId, actorUserId: auth.active.userId },
    { unitId: unit.id, repairId: typeof repairId === "string" ? repairId : "", afterPhotos },
  );
  revalidatePath(`/app/u/${unitSlug}/dorm/repairs`);
  revalidatePath(`/app/u/${unitSlug}/dorm/repairs/${typeof repairId === "string" ? repairId : ""}`);
  return r;
}
