"use server";
// pos-board-actions.ts — server actions ของบอร์ดงาน/ห้องทีม POS (POS P3.8 ▸ R2 R9 · CD-2 ◂) · เปลือกบาง: session → ctx/actor → pos-board-bridges.ts
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูลเสมอ
// 🔴 ร้าน/บทบาท/สิทธิ์จาก SESSION เท่านั้น (ค่าที่ client ส่งมาคือ id ของจุดขาย/แถวรายงาน + ค่าตั้ง — ด่านจริงอยู่ในตัวหลัก)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { posMembership } from "@/lib/modules/pos/access";
import type { RegisterActor, RegisterRole } from "@/lib/modules/pos/register-shared";
import type { PosBoardSettingsResult } from "@/lib/modules/pos/board-settings";
import { createAnomalyCard, savePosBoardSettings, type CreateAnomalyCardInput, type CreateAnomalyCardResult } from "./pos-board-bridges";

async function session(): Promise<{ tenantId: string; actor: RegisterActor }> {
  const auth = await requireTenant();
  const m = posMembership(auth.active);
  return { tenantId: auth.active.tenantId, actor: { userId: auth.user.id, role: m.role as RegisterRole, unitAccess: m.unitAccess, permissions: m.permissions } };
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** R9 ปุ่ม "สร้างการ์ด" ของแถวรายงานจุดผิดปกติ (P3.8U) */
export async function createAnomalyCardAction(args: { systemId: string; row: CreateAnomalyCardInput }): Promise<CreateAnomalyCardResult> {
  try {
    const s = await session();
    return await createAnomalyCard({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, args?.row);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos-board-actions] anomaly", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}

/** R2 แท็บ "บอร์ดงาน/ห้องทีม" (P3.8U) — เจ้าของร้านเท่านั้น (ด่านในตัวเขียน) */
export async function savePosBoardSettingsAction(args: { systemId: string; board?: unknown; teamRoom?: unknown }): Promise<PosBoardSettingsResult> {
  try {
    const s = await session();
    const input: { board?: unknown; teamRoom?: unknown } = {};
    if (args && "board" in args) input.board = args.board;
    if (args && "teamRoom" in args) input.teamRoom = args.teamRoom;
    return await savePosBoardSettings({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, input);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos-board-actions] settings", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
