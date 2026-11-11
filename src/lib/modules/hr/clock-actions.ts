"use server";
// HR H2.4 ▸ server actions ของการลงเวลาด้วยมือถือ (R8) — ยังไม่ติดตั้งบนหน้าใด (Q5: H2.10 วางในหน้า "ของฉัน")
//   ผู้ใช้ = เซสชัน (requireTenant) เท่านั้น · ไม่อ่านรหัสพนักงานจากฟอร์ม (COMMON §C.7 — clock.ts หาจาก employeeOfUser) ·
//   ไม่แตะ DB ในไฟล์นี้ · ผลลัพธ์ = ของ clock.ts ตรง ๆ (ไม่มีพิกัด — มีแค่ระยะห่าง) ◂
import { revalidatePath } from "next/cache";
import { requireMembership, requireTenant } from "@/lib/core/context";
import { mobileClock, myClockState, type MobileClockKind, type MobileClockResult, type MyClockState } from "./clock";

/** ด่านสิทธิ์ของงานลงเวลาของตัวเอง: สมาชิกของร้านนี้จริง (requireMembership) — ตัวตนพนักงานมาจากการผูกบัญชี (employeeOfUser) ไม่ใช่คีย์สิทธิ์ */
async function self(): Promise<{ tenantId: string; userId: string }> {
  const auth = await requireTenant();
  const m = await requireMembership(auth.active.tenantId);
  return { tenantId: m.tenantId, userId: auth.user.id };
}
const KINDS = new Set<MobileClockKind>(["NEXT", "BREAK_START", "BREAK_END"]);
/** ตัวเลขจากฟอร์ม ("" / ไม่มี = ไม่ส่ง) — ค่าที่อ่านไม่ได้ส่งต่อเป็น NaN ให้ clock.ts ตอบ "อ่านตำแหน่งไม่ได้" */
const numOf = (v: FormDataEntryValue | null): number | undefined => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);

/** ลงเวลาด้วยมือถือของตัวเอง — ฟอร์ม: kind · latitude · longitude · accuracy · deviceId */
export async function mobileClockAction(formData: FormData): Promise<MobileClockResult> {
  const actor = await self();
  const k = String(formData.get("kind") ?? "NEXT") as MobileClockKind;
  const res = await mobileClock(
    actor,
    {
      kind: KINDS.has(k) ? k : "NEXT",
      latitude: numOf(formData.get("latitude")),
      longitude: numOf(formData.get("longitude")),
      accuracyM: numOf(formData.get("accuracy")),
      deviceId: typeof formData.get("deviceId") === "string" ? String(formData.get("deviceId")) : undefined,
    },
  );
  if (res.ok) revalidatePath("/app");
  return res;
}

/** สถานะการลงเวลาของตัวเอง (ปุ่มถัดไป · กะ · จุดลงเวลา) */
export async function myClockStateAction(): Promise<MyClockState> {
  return myClockState(await self());
}
