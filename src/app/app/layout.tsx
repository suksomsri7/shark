import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef, SYSTEM_DEFS, FIXED_PAGE_SYSTEMS, isFixedPageSystem } from "@/lib/systems";
import { AppShell } from "@/components/app-shell/AppShell";
import { NavProgress } from "@/components/app-shell/NavProgress";
import type { NavItem, SoonItem } from "@/components/app-shell/NavDrawer";

// ฟังก์ชันย่อยของ "ระบบหน้า fixed" (เช่น KB /app/kb) → กาง accordion เหมือนระบบอื่น
// ⚠️ ทุก href ต้องมี page.tsx จริง — ตรวจโดย scripts/qc-nav-functions.mts (บล็อก KB)
function fixedPageChildrenFor(code: string): { href: string; label: string }[] | undefined {
  switch (code) {
    case "KB":
      // คลังความรู้: รายการ/ค้นหา (/app/kb) + เพิ่มบทความ (/app/kb/new)
      return [
        { href: "/app/kb", label: "คลังความรู้" },
        { href: "/app/kb/new", label: "เพิ่มบทความ" },
      ];
    default:
      return undefined; // fixed-page อื่นที่ไม่มีฟังก์ชันย่อย = item แบน
  }
}

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
      case "HR":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/hr/attendance`, label: "ลงเวลา" },
          { href: `${s}/hr/leave`, label: "ใบลา" },
          { href: `${s}/hr/employees`, label: "พนักงาน" },
          { href: `${s}/hr/payroll`, label: "เงินเดือน" },
        ];
      case "INVENTORY":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/inventory/items`, label: "สินค้า" },
          { href: `${s}/inventory/count`, label: "นับสต็อก" },
          { href: `${s}/inventory/movements`, label: "รับเข้า" },
          { href: `${s}/inventory/locations`, label: "คลัง" },
          { href: `${s}/inventory/procurement`, label: "จัดซื้อ" },
        ];
      case "CRM":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/crm/deals`, label: "ดีล" },
          { href: `${s}/crm/activities`, label: "งานติดตาม" },
          { href: `${s}/crm/contacts`, label: "ผู้ติดต่อ" },
        ];
      case "MARKETING":
        // ระบบการตลาดมีฟังก์ชันจริงเดียว (แคมเปญ) — ไม่ฝืนแตกเกินจริง
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/marketing/campaigns`, label: "แคมเปญ" },
        ];
      case "COUPON":
        // ระบบคูปองมีฟังก์ชันจริงเดียว (คูปอง) — ไม่ฝืนแตกเกินจริง
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/coupon/list`, label: "คูปอง" },
        ];
      case "MEMBER":
        // ระบบสมาชิกแตกจริง 4 ฟังก์ชัน: รายชื่อสมาชิก · นำเข้า CSV · แพ็กเกจสมาชิก (สร้าง/เปิด-ปิด) · สมัครสมาชิก (สมัครให้ลูกค้า)
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/member/customers`, label: "รายชื่อสมาชิก" },
          { href: `${s}/member/import`, label: "นำเข้า CSV" },
          { href: `${s}/member/plans`, label: "แพ็กเกจสมาชิก" },
          { href: `${s}/member/subscribe`, label: "สมัครสมาชิก" },
        ];
      case "POINT":
        // ระบบแต้มแตกจริง 3 ฟังก์ชัน: ตั้งค่าแต้ม (อัตรา) · ปรับแต้ม (ปรับ/แจก) · ประวัติแต้ม (ledger)
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/point/settings`, label: "ตั้งค่าแต้ม" },
          { href: `${s}/point/adjust`, label: "ปรับแต้ม" },
          { href: `${s}/point/ledger`, label: "ประวัติแต้ม" },
        ];
      case "REWARD":
        // ระบบรางวัลแตกจริง 3 ฟังก์ชัน: รายการรางวัล (เพิ่ม/ลบ) · แลกรางวัล (ฟอร์มแลก) · ประวัติการแลก
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/reward/rewards`, label: "รายการรางวัล" },
          { href: `${s}/reward/redeem`, label: "แลกรางวัล" },
          { href: `${s}/reward/history`, label: "ประวัติการแลก" },
        ];
      case "CHAT":
        // ระบบแชทลูกค้า: สนทนา (inbox รวมทุกช่องทาง) + เชื่อมช่องทาง (LINE/เว็บ/สมาชิก)
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/chat`, label: "สนทนา" },
          { href: `${s}/chat/channels`, label: "เชื่อมช่องทาง" },
        ];
      case "MEETING":
        // ระบบแชทภายในมีฟังก์ชันจริงเดียว (ห้องแชท) — ไม่ฝืนแตกเกินจริง
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/meeting`, label: "ห้องแชท" },
        ];
      case "KANBAN":
        // ระบบบอร์ดงาน: งานของฉัน (การ์ดที่มอบหมาย) + บอร์ดงาน (รายการบอร์ด + สร้าง)
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/kanban/my-tasks`, label: "งานของฉัน" },
          { href: `${s}/kanban/boards`, label: "บอร์ดงาน" },
        ];
      default:
        return undefined; // ที่เหลือ (COMING SOON ฯลฯ) = render inline หน้าเดียว ไม่มี sub-route
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
    // แตกฟังก์ชันย่อยเป็น accordion เหมือนระบบอื่น (ไม่ใช่ item แบนอีกต่อไป)
    // ⚠️ ทุก href ต้องมี page.tsx จริง (KB: /app/kb, /app/kb/new — ตรวจโดย qc-nav-functions.mts)
    ...SYSTEM_DEFS.filter(
      (s) => s.status === "available" && isFixedPageSystem(s.code),
    ).map((s) => {
      const children = fixedPageChildrenFor(s.code);
      return {
        key: `fp-${s.code}`,
        href: FIXED_PAGE_SYSTEMS[s.code],
        icon: s.icon,
        label: s.label,
        ...(children ? { children } : {}),
      };
    }),
  ];
  const soon: SoonItem[] = SYSTEM_DEFS.filter((s) => s.status === "coming_soon").map((s) => ({
    code: s.code,
    icon: s.icon,
    label: s.label,
  }));

  // ระบบที่ tenant เปิดใช้แล้ว (business unit + feature system) — ส่งให้ modal เพิ่มระบบ ปิด/ติดป้าย "เปิดแล้ว"
  const openedCodes = Array.from(
    new Set<string>([...units.map((u) => u.type), ...appSystems.map((s) => s.type)]),
  );

  return (
    <div className="min-h-full">
      <NavProgress />
      <AppShell
        tenantName={auth.active.tenant.name}
        userEmail={auth.user.email}
        items={items}
        soon={soon}
        openedCodes={openedCodes}
        // รายชื่อกิจการทั้งหมดของ user (สำหรับ dropdown สลับกิจการในหัว drawer)
        memberships={auth.memberships.map((m) => ({ tenantId: m.tenantId, name: m.tenant.name, role: m.role }))}
        activeTenantId={auth.active.tenantId}
      />
      {/* pt-14 = เว้นให้พ้น topbar (สูง 56px) · pb-24 = เว้นให้พ้นปุ่ม AI มุมซ้ายล่าง */}
      <main className="px-4 pb-24 pt-[calc(3.5rem+1rem)] sm:px-6">{children}</main>
    </div>
  );
}
