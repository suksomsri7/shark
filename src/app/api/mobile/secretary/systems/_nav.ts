// ตัวช่วยร่วมของ GET secretary/systems และ PUT secretary/systems/order (แถบบน topbar2 · 17 พ.ย.)
//   ระบบของกิจการ active ตามทะเบียนเมนูเว็บ (navSystems) — query 2 ตาราง · ไม่แตะสิทธิ์ (ผู้เรียกผ่าน gate แล้ว)
import { tenantDb } from "@/lib/core/db";
import { evaluate } from "@/lib/core/rbac";
import { CHAT_READ_ACTION } from "@/lib/modules/chat/guard";
import { NAV_HOME_KEY, navSystems, type NavSystem } from "@/lib/core/nav-systems";
import type { SecCtx } from "../_shared";

export async function loadNav(c: SecCtx): Promise<{ nav: NavSystem[]; appSystems: { id: string; type: string }[]; keys: string[] }> {
  const { tenantId, m } = c;
  const db = tenantDb({ tenantId });
  const [units, appSystems] = await Promise.all([
    db.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, name: true, type: true },
    }),
    db.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true } }),
  ]);
  // href แชท = กติกาเดียวกับเมนูเว็บ (evaluate บน Membership)
  const nav = navSystems(units, appSystems, { chatRead: evaluate(m, { module: "chat", action: CHAT_READ_ACTION }) });
  // ลำดับทะเบียนของแอป: "หน้าหลัก" ก่อน แล้วตามทะเบียน (เหมือนตารางในชีตเดิม)
  return { nav, appSystems, keys: [NAV_HOME_KEY, ...nav.map((n) => n.key)] };
}
