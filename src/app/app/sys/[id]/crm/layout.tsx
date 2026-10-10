import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { CRM_NAV_PERMS } from "@/lib/modules/crm/nav";
import { NavPermsProvider } from "@/components/nav-perms";

// layout ของโมดูล CRM (CRM C5.5-fix2 · รีวิว RV2-7) — ไม่วาดอะไรเพิ่ม: คิด "คีย์ของแท็บ" (CRM_NAV_PERMS) ของผู้ใช้ครั้งเดียว
// แล้วส่งลงทาง context ให้ `ModuleTabs` ทุกหน้าใต้ /crm กรองแท็บเอง (เดิมแต่ละหน้าต้องส่ง `can` ให้ crmNavItems เอง —
// ~38 หน้าไม่ได้ส่ง ⇒ แท็บ บริษัท/อีเมล/รายงาน/โควตา ฯลฯ หายจากทุกคน) · ส่งเฉพาะคีย์ที่แท็บอ้าง ไม่ใช่สิทธิ์ทั้งหมดของผู้ใช้
// 🔴 ด่านของแต่ละหน้า (404-not-403) ยังอยู่ที่หน้าเอง — ที่นี่แค่ตัดสินว่าจะ "โชว์ลิงก์" ไหม
export default async function CrmLayout({ children }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const perms = CRM_NAV_PERMS.filter((k) => crmCan(actor, k));
  return <NavPermsProvider perms={perms}>{children}</NavPermsProvider>;
}
