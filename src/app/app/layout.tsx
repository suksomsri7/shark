import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef, SYSTEM_DEFS, FIXED_PAGE_SYSTEMS, isFixedPageSystem } from "@/lib/systems";
import { AppShell } from "@/components/app-shell/AppShell";
import { NavProgress } from "@/components/app-shell/NavProgress";
import type { NavItem, SoonItem } from "@/components/app-shell/NavDrawer";

// โครงแอป: topbar ติดตายด้านบน (fixed) + drawer เมนูระบบ + ปุ่มผู้ช่วย AI + ศูนย์ช่วยเหลือ
// nav ยังมาจาก DB เหมือนเดิม (units + appSystems) — เปลี่ยนแค่การนำเสนอเป็น app shell
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  // perf A: badge (help/AI) ย้ายไปโหลดฝั่ง client หลังหน้าโผล่ — ไม่บล็อกการเปลี่ยนหน้า
  // layout เหลือแค่ query ที่จำเป็นต้องมีตอน render เมนู (units + appSystems)
  const [units, appSystems] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
  ]);

  // "แตกฟังก์ชันย่อยในเมนู" — ทุกระบบที่มี sub-route จริงจะกาง submenu (accordion) ใต้ชื่อระบบ
  // business = ต่อด้วย slug (/app/u/<slug>/...) · feature = ต่อด้วย id (/app/sys/<id>/...)
  // ⚠️ ทุก href ที่นี่ต้องมี page.tsx จริง (กัน dead link) — ตรวจโดย scripts/qc-nav-functions.mts
  const childrenFor = (
    type: string,
    slugOrId: string,
    kind: "business" | "feature",
  ): { href: string; label: string }[] | undefined => {
    if (kind === "business") {
      const b = `/app/u/${slugOrId}`;
      switch (type) {
        case "HOTEL":
          return [
            { href: `${b}/hotel`, label: "ภาพรวม" },
            { href: `${b}/hotel/reservations`, label: "การจอง" },
            { href: `${b}/hotel/setup`, label: "ตั้งค่าห้อง" },
          ];
        case "RESTAURANT":
          return [
            { href: `${b}/restaurant`, label: "หน้าร้าน" },
            { href: `${b}/restaurant/order`, label: "คีย์ออเดอร์" },
            { href: `${b}/restaurant/menu`, label: "เมนู" },
            { href: `${b}/restaurant/menu/options`, label: "ตัวเลือกเมนู" },
            { href: `${b}/restaurant/menu/stock`, label: "สต็อกเมนู" },
            { href: `${b}/restaurant/kds`, label: "ครัว" },
            { href: `${b}/restaurant/setup`, label: "ตั้งค่า" },
          ];
        case "SHOP":
          return [
            { href: `${b}/shop`, label: "ภาพรวม" },
            { href: `${b}/shop/orders`, label: "ออเดอร์" },
          ];
        case "QUEUE":
          return [
            { href: `${b}/queue`, label: "ภาพรวม" },
            { href: `${b}/queue/setup`, label: "ตั้งค่าคิว" },
          ];
        case "TICKET":
          return [
            { href: `${b}/ticket`, label: "อีเวนต์" },
            { href: `${b}/ticket/checkin`, label: "เช็คอิน" },
          ];
        case "BOOKING":
          return [
            { href: `${b}/booking`, label: "นัดวันนี้" },
            { href: `${b}/booking/services`, label: "บริการ" },
            { href: `${b}/booking/staff`, label: "พนักงาน" },
            { href: `${b}/booking/hours`, label: "เวลาทำการ" },
            { href: `${b}/booking/setup`, label: "ตั้งค่า" },
          ];
        default:
          return undefined; // RENTAL/SCHOOL/CLINIC = หน้าเดียว ไม่ต้องกาง
      }
    }
    const s = `/app/sys/${slugOrId}`;
    switch (type) {
      case "POS":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/pos/register`, label: "ขายหน้าร้าน" },
          { href: `${s}/pos/products`, label: "สินค้า/ราคา" },
          { href: `${s}/pos/sales`, label: "ประวัติบิล" },
          { href: `${s}/pos/close`, label: "ปิดวัน" },
        ];
      case "ACCOUNT":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/account/documents`, label: "เอกสาร" },
          { href: `${s}/account/journal`, label: "สมุดรายวัน" },
          { href: `${s}/account/reports`, label: "รายงาน" },
          { href: `${s}/account/accounts`, label: "ผังบัญชี" },
          { href: `${s}/account/tax`, label: "ภาษี" },
          { href: `${s}/account/contacts`, label: "คู่ค้า" },
          { href: `${s}/account/aging`, label: "อายุหนี้" },
          { href: `${s}/account/periods`, label: "งวดบัญชี" },
          { href: `${s}/account/assets`, label: "สินทรัพย์" },
          { href: `${s}/account/cheque`, label: "เช็ค" },
        ];
      default:
        return undefined; // INVENTORY/HR/MEMBER/… = render inline หน้าเดียว ไม่มี sub-route
    }
  };

  // ระบบทั้งหมด (business + feature) เป็นรายการเดียว
  const items: NavItem[] = [
    ...units.map((u) => {
      const children = childrenFor(u.type, u.slug, "business");
      return {
        key: `u-${u.id}`,
        href: `/app/u/${u.slug}`,
        icon: systemDef(u.type)?.icon ?? "•",
        label: u.name,
        ...(children ? { children } : {}),
      };
    }),
    ...appSystems.map((s) => {
      const children = childrenFor(s.type, s.id, "feature");
      return {
        key: `s-${s.id}`,
        href: `/app/sys/${s.id}`,
        icon: systemDef(s.type)?.icon ?? "•",
        label: s.name,
        ...(children ? { children } : {}),
      };
    }),
    // ระบบ "หน้า fixed ระดับ tenant" ที่เปิดใช้แล้ว (เช่น คลังความรู้ /app/kb) — เข้าถึงตรงจากเมนู
    ...SYSTEM_DEFS.filter(
      (s) => s.status === "available" && isFixedPageSystem(s.code),
    ).map((s) => ({
      key: `fp-${s.code}`,
      href: FIXED_PAGE_SYSTEMS[s.code],
      icon: s.icon,
      label: s.label,
    })),
  ];
  const soon: SoonItem[] = SYSTEM_DEFS.filter((s) => s.status === "coming_soon").map((s) => ({
    code: s.code,
    icon: s.icon,
    label: s.label,
  }));

  return (
    <div className="min-h-full">
      <NavProgress />
      <AppShell
        tenantName={auth.active.tenant.name}
        userEmail={auth.user.email}
        items={items}
        soon={soon}
        addHref="/app/settings/systems"
      />
      {/* pt-14 = เว้นให้พ้น topbar (สูง 56px) · pb-24 = เว้นให้พ้นปุ่ม AI มุมซ้ายล่าง */}
      <main className="px-4 pb-24 pt-[calc(3.5rem+1rem)] sm:px-6">{children}</main>
    </div>
  );
}
