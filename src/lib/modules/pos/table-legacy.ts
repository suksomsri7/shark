// table-legacy.ts — POS P2.4U มติ 10 (F4b): หน้าเดิมของร้านอาหาร (/app/u/<สาขา>/restaurant/**) ถามว่า "สาขานี้ใช้โหมดโต๊ะของ POS ไหม"
//   ใช้ ⇒ หน้าเดิมซ่อนปุ่ม "เช็คบิล" และ "ยกเลิกรายการ" แล้วแสดงโน้ต "จัดการที่ POS › โต๊ะ" + ลิงก์ (กันเก็บเงินซ้ำข้ามประตู — POS-OWNER-PENDING P2.4 fix 2 F4)
//   ตัดสิน: สาขาผูก POS ที่เปิดหน้าขายใหม่ (registerV2) + registerTableMode(...).visible ของผู้ใช้คนนั้น ·
//   ผู้ใช้ที่ไม่มีสิทธิ์หน้าขาย (registerTableMode ปฏิเสธ) ⇒ ตัดสินจากจำนวนโต๊ะของสาขา (ประตูเงินซ้ำต้องปิดสำหรับทุกคน)
// 🔴 อ่านอย่างเดียว · ฝั่งเซิร์ฟเวอร์เท่านั้น (หน้าเดิมเป็น server component) · ไม่เปลี่ยนพฤติกรรมของฟังก์ชันร้านอาหารใด ๆ

import { prisma } from "./db";
import { posMembership } from "./access";
import { posRegisterV2On } from "./register-shared";
import { registerTableMode } from "./table";

export async function posTableModeForUnit(
  auth: { user: { id: string }; active: { tenantId: string; role: Parameters<typeof posMembership>[0]["role"]; unitAccess: unknown; permissions: unknown } },
  unitId: string,
): Promise<{ href: string } | null> {
  try {
    const tenantId = auth.active.tenantId;
    const link = await prisma.appSystemUnit.findFirst({ where: { tenantId, unitId, type: "POS" }, select: { systemId: true } });
    if (!link) return null;
    const sys = await prisma.appSystem.findFirst({ where: { id: link.systemId, tenantId, type: "POS" }, select: { id: true, active: true, settings: true } });
    if (!sys || !sys.active || !posRegisterV2On(sys.settings)) return null;
    const href = `/app/sys/${sys.id}/pos/tables?unit=${encodeURIComponent(unitId)}`;
    const r = await registerTableMode({ tenantId, systemId: sys.id, unitId }, { userId: auth.user.id, ...posMembership(auth.active) });
    if (r.ok) return r.visible ? { href } : null;
    const tables = await (await import("@/lib/modules/restaurant")).tableCountForPos(prisma, { tenantId, unitId });
    return tables > 0 ? { href } : null;
  } catch (e) {
    console.error("[pos/table-legacy] posTableModeForUnit", e);
    return null;
  }
}
