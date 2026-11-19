// GET /api/mobile/secretary/systems — ระบบทั้งหมดของกิจการ active สำหรับตาราง "เปิดระบบ" ในชีตกิจการของแอป (14 พ.ย. · แบบ bizsheet4 ขั้น 2)
//   รายการ/ลำดับ/ป้าย/href = ทะเบียนเดียวกับเมนูเว็บ (`navSystems` ใน src/lib/core/nav-systems.ts ← src/app/app/layout.tsx)
//     ⇒ ผู้ใช้เห็นระบบชุดเดียวกับเมนูเว็บเดิม · ไม่กรองรายการ (เหมือนเว็บ) · แชทที่อ่านไม่ได้ ⇒ href หน้าเชื่อมช่องทาง
//   wire: `{ items: [{ key, kind: "unit"|"system"|"fixed", code, href, label, badge }] }` · href ขึ้นต้น /app เสมอ (แอปเปิดใน WebView หน้าระบบ)
//   badge = แชทลูกค้าที่ยังไม่อ่านของระบบแชทนั้น (`unreadFor` ตัวเดียวกับ secretary/badges · ไม่มีสิทธิ์อ่านแชท = 0) · ระบบอื่น = 0
// ด่าน = สมาชิกร้าน (gate null · เมนูเว็บก็ไม่ต้องใช้คีย์) · 60/นาที ต่อ Membership · query 2 ตาราง + นับแชทเฉพาะระบบแชท
// 17 พ.ย. (เจ้าของอนุมัติแบบ topbar2): แถบบนแอปแสดงทุกระบบ + ผู้ใช้จัดลำดับเองได้ "ต่อคน ต่อร้าน" (User.prefs.secSystemOrder · PUT systems/order)
//   items เรียงตามลำดับของผู้เรียกแล้ว (คีย์ที่บันทึกก่อน · ระบบใหม่ต่อท้ายตามทะเบียน · คีย์ที่ไม่มีแล้วไม่สน)
//   `order` = ลำดับเต็มรวมช่อง "home" (หน้าหลัก /app · ไม่อยู่ใน items เพื่อให้แอปรุ่นเก่าที่เติม "หน้าหลัก" เองไม่เห็นซ้ำ)
//   เมนูเว็บไม่อ่านลำดับนี้ (ลำดับเว็บคงเดิม)
// 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): "team" "calendar" เป็นคีย์ที่ถูกต้องแบบ "home"
//   ลำดับที่ยังไม่มี 2 คีย์นี้ (ผู้ใช้เดิม/ไม่เคยจัด/แอปรุ่นเก่าส่งมา) = ขึ้นหน้าสุด ทีม → ปฏิทิน (orderNavKeys) · wire เดิม (items ไม่มี 2 ช่องนี้ · แอปรุ่นเก่าตัดคีย์ที่ไม่รู้จัก)
import { getSystemOrder } from "@/lib/core/user-preferences";
import { orderNavKeys } from "@/lib/core/nav-systems";
import { READ, can, unreadFor, type InboxCtx } from "../../inbox/_shared";
import { gate, ok, thrown, withRateLimit, withErrors } from "../_shared";
import { loadNav } from "./_nav";

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const { userId, tenantId, m } = a.c;
  const rl = await withRateLimit(`${tenantId}:${userId}`, "systems", 60);
  if (rl) return rl;
  try {
    const [{ nav, appSystems, keys }, saved] = await Promise.all([loadNav(a.c), getSystemOrder(userId, tenantId)]);
    const order = orderNavKeys(keys, saved);
    const rank = new Map(order.map((k, i) => [k, i]));
    nav.sort((x, y) => (rank.get(x.key) ?? 0) - (rank.get(y.key) ?? 0));
    // badge ใช้ด่านแอป can(READ) แบบ secretary/badges
    const ic: InboxCtx = { g: a.c.g, tenantId, userId, m, ua: m.unitAccess };
    const chatRead = can(ic, READ);
    const chatIds = new Set(appSystems.filter((s) => s.type === "CHAT").map((s) => s.id));
    const badges = await Promise.all(
      nav.map((n) => (chatRead && n.kind === "system" && chatIds.has(n.ref) ? unreadFor(ic, n.ref).catch(() => 0) : Promise.resolve(0))),
    );
    return ok({
      items: nav.map((n, i) => ({ key: n.key, kind: n.kind, code: n.code, href: n.href, label: n.label, badge: badges[i] })),
      order,
    });
  } catch (e) {
    return thrown(e, "systems");
  }
}

// R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ)
export const GET = withErrors("secretary/systems GET", GET_);
