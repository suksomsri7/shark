// legacy-door.ts — POS P2.14 ▸ LEG-1–4 (มติ 1 "guard, not delete"): ประตูเดิมของร้านอาหารบนสาขาที่ผูก POS
//   สาขาที่ผูก POS (AppSystemUnit type POS + ระบบ POS active) = ประตูเดิมปิด:
//     route ของแขก (api/store/…/restaurant/{order,session,service-request} · (store)/s/…/restaurant/{bill,notify-payment}) = 409 POS_LINKED + ประตูใหม่ /q/t/<qrToken>
//     หน้าเดิมของพนักงาน (checkout/[sessionId] · tables/[sessionId] · order · kds · kds/[stationId]) = redirect ไปหน้า POS (โต๊ะ / ครัว) + แถบแจ้ง
//     action เดิม (เช็คบิล · ยืนยันพร้อมเพย์ · ยกเลิกรายการ · รวมโต๊ะ · เดิน/ดึงกลับครัว) + ผู้ช่วย AI ปิดบิล = ปฏิเสธ POS_LINKED
//   สาขาที่ไม่ผูก POS = ทางเดิมทุกไบต์ (ตัวกันคืน false · ไฟล์เดิมเพิ่มได้แค่บล็อก // POS P2.14 ▸ … ◂)
// 🔴 fail-closed สำหรับทางเขียน: ค้นไม่ได้/DB ล้ม + write ⇒ true (ปิดประตู) · ทางอ่าน ⇒ false · ไม่ throw ทุกกรณี
// 🔴 อ่าน AppSystemUnit/AppSystem เท่านั้น (ไม่แตะตาราง Restaurant* — ผู้เขียนเดียวของร้านอาหารคงเดิม) · ตัวลบโมดูลเดิม = หลังเปิดใช้จริง (P6)

import { prisma } from "./db";
import { posRegisterV2On } from "./register-shared";

/** client ที่ตัวกันใช้ (ทดสอบส่ง client ที่ throw เพื่อพิสูจน์ fail-closed) */
type DoorDb = {
  appSystemUnit: { findUnique(args: unknown): Promise<{ systemId: string } | null> };
  appSystem: { findFirst(args: unknown): Promise<{ id: string; settings?: unknown } | null> };
};
export type LegacyDoorOpts = { write?: boolean; db?: unknown };

async function posLinkOf(db: DoorDb, tenantId: string, unitId: string): Promise<{ systemId: string; settings: unknown } | null> {
  const link = await db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } });
  if (!link) return null;
  const sys = await db.appSystem.findFirst({ where: { id: link.systemId, tenantId, type: "POS", active: true }, select: { id: true, settings: true } });
  return sys ? { systemId: sys.id, settings: sys.settings ?? null } : null;
}

/**
 * true = สาขานี้ผูก POS ⇒ ประตูเดิมของร้านอาหารปิด · false = ทางเดิมทำงานตามเดิม
 * ค้นไม่ได้ (อาร์กิวเมนต์ผิดรูป/DB ล้ม) ⇒ `opts.write ? true : false` (ทางเขียนปิดไว้ก่อน) · ไม่ throw
 */
export async function posLinkedLegacyDoor(tenantId: string, unitId: string, opts?: LegacyDoorOpts): Promise<boolean> {
  const failClosed = opts?.write === true;
  try {
    if (typeof tenantId !== "string" || !tenantId || typeof unitId !== "string" || !unitId) return failClosed;
    const db = (opts?.db ?? prisma) as DoorDb;
    return (await posLinkOf(db, tenantId, unitId)) !== null;
  } catch (e) {
    console.error("[pos/legacy-door] posLinkedLegacyDoor", e instanceof Error ? e.message : e);
    return failClosed;
  }
}

/** ประตูใหม่ของแขก (หน้า QR โต๊ะของ POS) — โทเคนเข้ารหัส URI */
export function legacyQrDoor(qrToken: string): string {
  return `/q/t/${encodeURIComponent(String(qrToken ?? ""))}`;
}

/** คำตอบของ route เดิมบนสาขาที่ผูก POS (409) — route ห่อเป็น NextResponse.json เอง */
export function posLinkedBody(qrToken: string): { error: "POS_LINKED"; door: string } {
  return { error: "POS_LINKED", door: legacyQrDoor(qrToken) };
}

/**
 * หน้าเดิมของพนักงาน: สาขาที่ผูก POS ⇒ { systemId, v2 } (หน้าเดิม redirect ไป /app/sys/<systemId>/pos/… · v2 = หน้าขายใหม่มีหน้าโต๊ะ/ครัว)
 * ไม่ผูก POS ⇒ null (หน้าเดิมทำงานตามเดิม) · DB ล้ม ⇒ null (หน้าเดิมแสดงได้ — ปุ่มเงินทุกปุ่มถูกปฏิเสธที่ action แบบ fail-closed อยู่แล้ว)
 */
export async function posLinkedLegacyPage(tenantId: string, unitId: string): Promise<{ systemId: string; v2: boolean } | null> {
  try {
    const l = await posLinkOf(prisma as unknown as DoorDb, tenantId, unitId);
    return l ? { systemId: l.systemId, v2: posRegisterV2On(l.settings) } : null;
  } catch (e) {
    console.error("[pos/legacy-door] posLinkedLegacyPage", e instanceof Error ? e.message : e);
    return null;
  }
}
