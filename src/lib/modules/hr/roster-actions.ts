"use server";
// HR H2.2 ▸ server actions ของบอร์ดตารางกะ — 6 ตัว · รับอ็อบเจกต์เดียว (systemId + ช่องของงาน) · ห่อบาง ๆ เหนือ rosterOpCore
//   ด่านสิทธิ์ + ระบบ HR ของร้าน + เครื่องยนต์ H2.1 อยู่ในแกน (roster-board.ts) · ผล = { ok, …จำนวน } | { ok:false, code } (รหัสจาก allowlist)
//   สำเร็จ ⇒ revalidatePath หน้าบอร์ด (ตอบกลับพร้อมหน้าใหม่ในรอบเดียว) · ไฟล์นี้ส่งออกได้เฉพาะ async function (กติกา "use server") ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { rosterOpCore } from "./roster-board";
import type { RosterOpResult } from "./roster-board-shared";

type Op = Record<string, unknown>;
const sysOf = (input: Op | null | undefined) => (typeof input?.systemId === "string" ? input.systemId : "");

export async function generateRosterAction(input: { systemId: string; from: string; to: string; unitId?: string | null }): Promise<RosterOpResult> {
  const auth = await requireTenant();
  const r = await rosterOpCore(auth, { ...(input as Op), kind: "generate" });
  if (r.ok) revalidatePath(`/app/sys/${sysOf(input)}/hr/roster`);
  return r;
}

export async function copyRosterWeekAction(input: { systemId: string; fromWeek: string; toWeek: string; unitId?: string | null }): Promise<RosterOpResult> {
  const auth = await requireTenant();
  const r = await rosterOpCore(auth, { ...(input as Op), kind: "copy" });
  if (r.ok) revalidatePath(`/app/sys/${sysOf(input)}/hr/roster`);
  return r;
}

export async function addRosterEntryAction(input: { systemId: string; employeeId: string; date: string; shiftId: string; startMin?: number; endMin?: number }): Promise<RosterOpResult> {
  const auth = await requireTenant();
  const r = await rosterOpCore(auth, { ...(input as Op), kind: "add" });
  if (r.ok) revalidatePath(`/app/sys/${sysOf(input)}/hr/roster`);
  return r;
}

export async function moveRosterEntryAction(input: { systemId: string; entryId: string; date?: string; shiftId?: string; employeeId?: string }): Promise<RosterOpResult> {
  const auth = await requireTenant();
  const r = await rosterOpCore(auth, { ...(input as Op), kind: "move" });
  if (r.ok) revalidatePath(`/app/sys/${sysOf(input)}/hr/roster`);
  return r;
}

export async function removeRosterEntryAction(input: { systemId: string; entryId: string }): Promise<RosterOpResult> {
  const auth = await requireTenant();
  const r = await rosterOpCore(auth, { ...(input as Op), kind: "remove" });
  if (r.ok) revalidatePath(`/app/sys/${sysOf(input)}/hr/roster`);
  return r;
}

export async function publishRosterAction(input: { systemId: string; from: string; to: string; unitId?: string | null }): Promise<RosterOpResult> {
  const auth = await requireTenant();
  const r = await rosterOpCore(auth, { ...(input as Op), kind: "publish" });
  if (r.ok) revalidatePath(`/app/sys/${sysOf(input)}/hr/roster`);
  return r;
}
