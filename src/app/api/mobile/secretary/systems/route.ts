// GET /api/mobile/secretary/systems — ระบบทั้งหมดของกิจการ active สำหรับตาราง "เปิดระบบ" ในชีตกิจการของแอป (14 พ.ย. · แบบ bizsheet4 ขั้น 2)
//   รายการ/ลำดับ/ป้าย/href = ทะเบียนเดียวกับเมนูเว็บ (`navSystems` ใน src/lib/core/nav-systems.ts ← src/app/app/layout.tsx)
//     ⇒ ผู้ใช้เห็นระบบชุดเดียวกับเมนูเว็บเดิม · ไม่กรองรายการ (เหมือนเว็บ) · แชทที่อ่านไม่ได้ ⇒ href หน้าเชื่อมช่องทาง
//   wire: `{ items: [{ key, kind: "unit"|"system"|"fixed", code, href, label, badge }] }` · href ขึ้นต้น /app เสมอ (แอปเปิดใน WebView หน้าระบบ)
//   badge = แชทลูกค้าที่ยังไม่อ่านของระบบแชทนั้น (`unreadFor` ตัวเดียวกับ secretary/badges · ไม่มีสิทธิ์อ่านแชท = 0) · ระบบอื่น = 0
// ด่าน = สมาชิกร้าน (gate null · เมนูเว็บก็ไม่ต้องใช้คีย์) · 60/นาที ต่อ Membership · query 2 ตาราง + นับแชทเฉพาะระบบแชท
import { tenantDb } from "@/lib/core/db";
import { evaluate } from "@/lib/core/rbac";
import { CHAT_READ_ACTION } from "@/lib/modules/chat/guard";
import { navSystems } from "@/lib/core/nav-systems";
import { READ, can, unreadFor, type InboxCtx } from "../../inbox/_shared";
import { gate, ok, thrown, withRateLimit, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const { userId, tenantId, m } = a.c;
  const rl = await withRateLimit(`${tenantId}:${userId}`, "systems", 60);
  if (rl) return rl;
  try {
    const db = tenantDb({ tenantId });
    const [units, appSystems] = await Promise.all([
      db.businessUnit.findMany({
        where: { tenantId, status: { not: "ARCHIVED" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, slug: true, name: true, type: true },
      }),
      db.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true } }),
    ]);
    // href แชท = กติกาเดียวกับเมนูเว็บ (evaluate บน Membership) · badge ใช้ด่านแอป can(READ) แบบ secretary/badges
    const nav = navSystems(units, appSystems, { chatRead: evaluate(m, { module: "chat", action: CHAT_READ_ACTION }) });
    const ic: InboxCtx = { g: a.c.g, tenantId, userId, m, ua: m.unitAccess };
    const chatRead = can(ic, READ);
    const chatIds = new Set(appSystems.filter((s) => s.type === "CHAT").map((s) => s.id));
    const badges = await Promise.all(
      nav.map((n) => (chatRead && n.kind === "system" && chatIds.has(n.ref) ? unreadFor(ic, n.ref).catch(() => 0) : Promise.resolve(0))),
    );
    return ok({
      items: nav.map((n, i) => ({ key: n.key, kind: n.kind, code: n.code, href: n.href, label: n.label, badge: badges[i] })),
    });
  } catch (e) {
    return thrown(e, "systems");
  }
}

// R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ)
export const GET = withErrors("secretary/systems GET", GET_);
