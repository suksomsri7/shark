// PUT /api/mobile/secretary/systems/order {keys: string[]} — บันทึกลำดับไอคอนระบบบนแถบบนแอป (เจ้าของอนุมัติแบบ topbar2 · 17 พ.ย.)
//   "ต่อคน ต่อร้าน": เขียน User.prefs.secSystemOrder[<tenantId ของ gate>] ของผู้เรียกเท่านั้น (เจ้าของ/พนักงานแต่ละคนมีลำดับของตัวเอง)
//   ด่าน/เพดานแบบเพื่อนบ้าน GET secretary/systems: สมาชิกร้าน (gate null) · 30/นาที ต่อ Membership (ลากเสร็จ 1 ครั้ง = 1 คำขอ)
//   รับเฉพาะคีย์ที่เป็นของร้านนี้ตอนนี้ ("home" + ทะเบียน navSystems) — คีย์อื่น (ร้านอื่น/ระบบที่ปิดแล้ว/พิมพ์มั่ว) ถูกตัดทิ้งเงียบ ๆ
//   คีย์ของร้านที่ไม่ได้ส่งมา = ต่อท้ายตามทะเบียน · คืน `{ order }` = ลำดับเต็มหลังบันทึก (รูปเดียวกับ GET systems `order`)
//   เมนูเว็บไม่อ่านค่านี้ (ลำดับเว็บคงเดิม)
// 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): "team" "calendar" เป็นคีย์ที่ถูกต้องแบบ "home"
//   ลำดับที่ยังไม่มี 2 คีย์นี้ (ผู้ใช้เดิม/ไม่เคยจัด/แอปรุ่นเก่าส่งมา) = ขึ้นหน้าสุด ทีม → ปฏิทิน (orderNavKeys) · wire เดิม (items ไม่มี 2 ช่องนี้ · แอปรุ่นเก่าตัดคีย์ที่ไม่รู้จัก)
import { z } from "zod";
import { SYSTEM_ORDER_MAX, setSystemOrder } from "@/lib/core/user-preferences";
import { orderNavKeys } from "@/lib/core/nav-systems";
import { gate, ok, readBody, thrown, withRateLimit, withErrors } from "../../_shared";
import { loadNav } from "../_nav";

const Body = z.object({ keys: z.array(z.string().trim().min(1).max(80)).max(SYSTEM_ORDER_MAX) }).strict();

async function PUT_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const { userId, tenantId } = a.c;
  const rl = await withRateLimit(`${tenantId}:${userId}`, "systems-order", 30);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const { keys } = await loadNav(a.c);
    const order = orderNavKeys(keys, b.v.keys);
    await setSystemOrder(userId, tenantId, order);
    return ok({ order });
  } catch (e) {
    return thrown(e, "systems/order");
  }
}

// R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ)
export const PUT = withErrors("secretary/systems/order PUT", PUT_);
