import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef, SYSTEM_DEFS, FIXED_PAGE_SYSTEMS, isFixedPageSystem } from "@/lib/systems";
import { AppShell } from "@/components/app-shell/AppShell";
import { AppMain } from "@/components/app-shell/AppMain";
import { NavProgress } from "@/components/app-shell/NavProgress";
import { ThemeRoot } from "@/components/app-shell/ThemeRoot";
// ธีมของร้าน (B3) + ค่าส่วนตัวของผู้ใช้ — โหลดที่ layout ที่เดียว แล้วส่งลงเป็น props
import { getBrandingTokens } from "@/lib/branding/service";
import { getUserPreferences } from "@/lib/core/user-preferences";
import type { NavItem, SoonItem } from "@/components/app-shell/NavDrawer";
// เมนูบอร์ดงาน 7 หมวด (§5.2) มาจากทะเบียนเดียวกับแถบแท็บในโมดูล — ห้ามพิมพ์ลิสต์ซ้ำที่นี่
// K2.10: ส่ง actor เข้าไปด้วยให้ `kanbanNavChildren` ซ่อน "รายงาน" สำหรับคนที่ไม่มีคีย์ kanban.report.view
import { kanbanNavChildren } from "@/lib/modules/kanban/nav";
import { toActor } from "@/lib/modules/kanban/access";
// M1.3: เมนู 9 หมวดของระบบสมาชิก v2 (§2.2) มาจากทะเบียนเดียวกับแถบแท็บในโมดูล — ห้ามพิมพ์ลิสต์ซ้ำที่นี่
import { memberNavChildren } from "@/lib/modules/member/nav";
import { toMemberActor } from "@/lib/modules/member/access";
// เมนูของระบบแชทซ่อนตามสิทธิ์จริง — ใช้ทะเบียน/ตัวช่วยชุดเดียวกับด่านของโมดูล (ไม่พิมพ์คีย์ซ้ำ)
import { evaluate } from "@/lib/core/rbac";
// CRM uiVersion gate ▸ ตัวอ่าน settings.crm แบบบริสุทธิ์ (แปลงค่าจาก JSON · ค่าเริ่มต้น uiVersion 1) ◂
import { crmCan, parseCrmSettings } from "@/lib/modules/crm";
import { membershipOf, CHAT_READ_ACTION } from "@/lib/modules/chat/guard";

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
  // 🔴 3 query ขนานกัน — ธีม (แคช 60 วิ ต่อ instance) และ prefs เบา ๆ ไม่เพิ่ม round-trip ที่รอเรียงกัน
  const [units, appSystems, tokens, prefs] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    getBrandingTokens(tenantId),
    getUserPreferences(auth.user.id),
  ]);

  // CRM uiVersion gate ▸ ระบบ CRM ที่เปิดหน้าจอ v2 แล้ว (settings.crm.uiVersion = 2) — อ่านจากแถวที่โหลดข้างบน ไม่มี query เพิ่ม ◂
  const crmV2 = new Set(appSystems.filter((x) => x.type === "CRM" && parseCrmSettings(x.settings).uiVersion === 2).map((x) => x.id));

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
            { href: `${b}/booking/staff`, label: "ใครรับคิว" },
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
          { href: `${s}/pos/products`, label: "สินค้า/บริการ" },
          { href: `${s}/pos/sales`, label: "ประวัติบิล" },
          { href: `${s}/pos/close`, label: "ปิดวัน" },
        ];
      case "ACCOUNT":
        // เจ้าของสั่ง 6 ก.ย. 2569: ไม่เอาเมนูย่อยของบัญชีในแถบเมนู — หมวดทั้ง 9 อยู่ในหน้าหลักของระบบบัญชีแล้ว
        return undefined;
      case "HR":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/hr/attendance`, label: "ลงเวลา" },
          { href: `${s}/hr/kiosk`, label: "จอลงเวลา" },
          { href: `${s}/hr/leave`, label: "ใบลา" },
          { href: `${s}/hr/employees`, label: "พนักงาน" },
          { href: `${s}/hr/payroll`, label: "เงินเดือน" },
        ];
      case "INVENTORY":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/inventory/items`, label: "สินค้า" },
          { href: `${s}/inventory/services`, label: "บริการ" },
          { href: `${s}/inventory/count`, label: "นับสต็อก" },
          { href: `${s}/inventory/movements`, label: "รับเข้า" },
          { href: `${s}/inventory/locations`, label: "คลัง" },
          { href: `${s}/inventory/procurement`, label: "จัดซื้อ" },
          { href: `${s}/inventory/settings`, label: "ตั้งค่า" },
        ];
      case "CRM":
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/crm/deals`, label: "ดีล" },
          { href: `${s}/crm/activities`, label: "งานติดตาม" },
          { href: `${s}/crm/contacts`, label: "ผู้ติดต่อ" },
          // CRM uiVersion gate ▸ เมนูของ CRM v2 (C1.3–C1.5) โผล่เฉพาะระบบที่ `settings.crm.uiVersion = 2` (มติ C23 · R-E.14)
          //   uiVersion 1 (ทุกร้านบน prod จนกว่าเจ้าของเปิดเอง) = เมนูเดิมก่อน C1.3 ทุกตัวอักษร · อ่านจากแถว appSystems ที่โหลดอยู่แล้ว (ไม่มี query เพิ่ม)
          ...(crmV2.has(slugOrId)
            ? [
              // CRM C1.3 ▸ บริษัท (รายชื่อ + เพิ่มบริษัท) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts` (CRM_NAV · CRM_DEEP_NAV)
              { href: `${s}/crm/companies`, label: "บริษัท" },
              { href: `${s}/crm/companies/new`, label: "เพิ่มบริษัท" },
              // ◂ CRM C1.3
              // CRM C1.4 ▸ เพิ่มผู้ติดต่อ (รายชื่อผู้ติดต่อข้างบนเป็นหน้า v2 แล้ว) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts` (CRM_DEEP_NAV)
              { href: `${s}/crm/contacts/new`, label: "เพิ่มผู้ติดต่อ" },
              // ◂ CRM C1.4
              // CRM C1.5 ▸ ดีล v2 (เพิ่มดีล · pipeline · ตั้งค่า pipeline/ขั้น/เหตุผลที่แพ้) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts` (CRM_DEEP_NAV)
              { href: `${s}/crm/deals/new`, label: "เพิ่มดีล" },
              { href: `${s}/crm/pipelines`, label: "pipeline ทั้งหมด" },
              // หน้าตั้งค่า = 404 สำหรับคนที่ไม่มี `crm.settings.manage` ⇒ ไม่โชว์ลิงก์ตาย (รีวิว C1.5)
              // CRM C1.7: ด่านเดียวกับหน้าตั้งค่า (`crmCan` — MANAGER ปริยายไม่มี crm.settings.manage §6.1)
              ...(crmCan(membershipOf(auth), "crm.settings.manage")
                ? [
                    { href: `${s}/crm/settings/pipelines`, label: "ตั้งค่า pipeline" },
                    { href: `${s}/crm/settings/stages`, label: "ตั้งค่าขั้นของดีล" },
                    { href: `${s}/crm/settings/lost-reasons`, label: "เหตุผลที่แพ้" },
                  ]
                : []),
              // ◂ CRM C1.5
              // CRM C1.7 ▸ การมองเห็นข้อมูล (404 สำหรับคนที่ไม่มี crm.visibility.manage ⇒ ไม่โชว์ลิงก์ตาย) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts`
              ...(crmCan(membershipOf(auth), "crm.visibility.manage") ? [{ href: `${s}/crm/settings/visibility`, label: "การมองเห็นข้อมูล" }] : []),
              // ◂ CRM C1.7
              // CRM C1.9 ▸ วัตถุกำหนดเอง (404 สำหรับคนที่ไม่มี crm.object.manage ⇒ ไม่โชว์ลิงก์ตาย) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts` (CRM_DEEP_NAV)
              ...(crmCan(membershipOf(auth), "crm.object.manage") ? [{ href: `${s}/crm/settings/objects`, label: "วัตถุกำหนดเอง" }] : []),
              // รีวิว S3: สารบัญข้อมูลกำหนดเอง (ทุกคนที่มี crm.record.read · 404 สำหรับคนอื่น ⇒ ไม่โชว์ลิงก์ตาย)
              ...(crmCan(membershipOf(auth), "crm.record.read") ? [{ href: `${s}/crm/objects`, label: "ข้อมูลกำหนดเอง" }] : []),
              // ◂ CRM C1.9
              // CRM C1.6 ▸ ปฏิทินกิจกรรม (หน้า v2 ล้วน) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts` (CRM_NAV)
              { href: `${s}/crm/calendar`, label: "ปฏิทิน" },
              // ◂ CRM C1.6
              // CRM C1.10 ▸ ตั้งค่า CRM (หน้ารวม · crm.settings.manage) · API และ webhook (crm.api.manage) — 404 สำหรับคนที่ไม่มีคีย์ ⇒ ไม่โชว์ลิงก์ตาย
              ...(crmCan(membershipOf(auth), "crm.settings.manage") ? [{ href: `${s}/crm/settings`, label: "ตั้งค่า CRM" }] : []),
              ...(crmCan(membershipOf(auth), "crm.api.manage") ? [{ href: `${s}/crm/settings/api`, label: "API และ webhook" }] : []),
              // ◂ CRM C1.10
              // CRM C2.1 ▸ กฎอัตโนมัติ (404 สำหรับคนที่ไม่มี crm.automation.manage ⇒ ไม่โชว์ลิงก์ตาย) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts`
              //   ACCEPTANCE-FIX ของผู้คุมงาน 23 ก.ย.: หน้ามีจริงและขึ้นทะเบียน status "ready" ตั้งแต่ C2.1 แต่ไม่ได้ต่อเข้าลิ้นชักเมนู ⇒ qc-nav-functions S5 แดง (เข้าหน้าไม่ได้ถ้าไม่พิมพ์ URL เอง)
              ...(crmCan(membershipOf(auth), "crm.automation.manage") ? [{ href: `${s}/crm/settings/automation`, label: "กฎอัตโนมัติ" }] : []),
              // ◂ CRM C2.1
              // CRM C1.11 ▸ นำเข้า/ตัวซ้ำ (404 สำหรับคนที่ไม่มีคีย์ของหน้านั้น ⇒ ไม่โชว์ลิงก์ตาย) — ทะเบียนเต็มอยู่ที่ `crm/nav.ts` (CRM_DEEP_NAV)
              ...(crmCan(membershipOf(auth), "crm.contact.import") ? [{ href: `${s}/crm/contacts/import`, label: "นำเข้าผู้ติดต่อ" }] : []),
              ...(crmCan(membershipOf(auth), "crm.contact.merge") ? [{ href: `${s}/crm/contacts/duplicates`, label: "ผู้ติดต่อที่น่าจะซ้ำ" }] : []),
              ...(crmCan(membershipOf(auth), "crm.company.merge") ? [{ href: `${s}/crm/companies/duplicates`, label: "บริษัทที่น่าจะซ้ำ" }] : []),
              // ◂ CRM C1.11
              ]
            : []),
          // ◂ CRM uiVersion gate
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
        // M1.3: เมนู 9 หมวด (§2.2) ย้ายไปทะเบียนกลาง `member/nav.ts` เหมือนบอร์ดงาน/บัญชี — ห้ามพิมพ์ลิสต์ซ้ำที่นี่
        // (memberNavChildren ต่อท้ายด้วยลิงก์ v1 เดิม 5 อัน: customers/import/plans/tiers/subscribe จนกว่า
        //  WO ที่แทนที่ฟังก์ชันเดียวกันจะย้ายผู้ใช้ไปหน้าใหม่แล้วค่อยตัดออก)
        return memberNavChildren(s, toMemberActor(auth.user.id, auth.active));
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
        // เจ้าของสั่ง 6 ก.ย. 2569: ไม่เอาเมนูย่อยของแชท (ภาพรวม/เชื่อมช่องทาง) — แท็บอยู่ในหน้าแชทแล้ว
        // (ลิงก์ "เชื่อมช่องทาง" ยังเข้าได้จากเมนู ⋮ ในหัวรายการแชท · สิทธิ์อ่านแชทตรวจที่ requireChatRead())
        return undefined;
      case "MEETING":
        // ระบบแชทภายในมีฟังก์ชันจริงเดียว (ห้องแชท) — ไม่ฝืนแตกเกินจริง
        return [
          { href: s, label: "ภาพรวม" },
          { href: `${s}/meeting`, label: "ห้องแชท" },
        ];
      case "KANBAN":
        // ระบบบอร์ดงาน (K1.14 · แบบ §5.2 "เมนูโมดูล 7 หมวด") — ทะเบียนเดียวที่ `kanban/nav.ts`
        // ใช้ร่วมกับแถบแท็บในโมดูล · drawer ใส่เฉพาะหมวดที่มี `page.tsx` จริง
        // (หมวดที่ยังไม่มา เช่น กล่องงานเข้า/ปฏิทินงาน/ระบบอัตโนมัติ/รายงาน/ตั้งค่า โชว์ป้าย
        //  "เร็ว ๆ นี้" ในแถบแท็บแทน — ลิงก์ที่กดแล้ว 404 คือ dead link ที่ qc-nav-functions.mts ห้าม)
        return kanbanNavChildren(s, toActor(auth.user.id, auth.active));
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
      // ระบบแชท: คนไม่มีสิทธิ์อ่านแชท → ลิงก์ระบบพาไปหน้าเชื่อมช่องทางแทนกล่องแชท (ด่านจริง requireChatRead())
      const chatHref = s.type === "CHAT" && !evaluate(membershipOf(auth), { module: "chat", action: CHAT_READ_ACTION })
        ? `/app/sys/${s.id}/chat/channels`
        : `/app/sys/${s.id}`;
      return {
        key: `s-${s.id}`,
        href: chatHref,
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

  // badge "ข้อความลูกค้ายังไม่ได้อ่าน" ที่เมนู (B9) — ส่งแค่ **รายชื่อ id ของระบบแชท** ลงไป
  // ได้มาจาก appSystems ที่ query ไปแล้วข้างบน ⇒ ไม่มี query เพิ่มใน layout เลย
  // ร้านที่ไม่ได้เปิดระบบแชท = ลิสต์ว่าง → ฝั่ง client ไม่ถามตัวเลขนี้เลย (ดู loadNavBadgesAction)
  const chatSystemIds = appSystems.filter((s) => s.type === "CHAT").map((s) => s.id);
  // CRM C1.7 ▸ ลิงก์ "ทีมขาย" ในเมนูตั้งค่า: เฉพาะร้านที่มีระบบ CRM และผู้ใช้เป็นเจ้าของร้าน/ถือคีย์ crm.team.manage (หน้าเป็น 404 สำหรับคนอื่น) ◂
  const showTeams = appSystems.some((x) => x.type === "CRM") && (auth.active.role === "OWNER" || crmCan(membershipOf(auth), "crm.team.manage"));

  return (
    <div className="min-h-full">
      {/* โทเคนธีมที่ราก — ทุกหน้าใต้ /app อ่านสีผ่าน CSS var ชุดนี้ (ไม่มีใครรับสีเป็น prop) */}
      <ThemeRoot
        tokens={{
          accent: tokens.accent,
          accentFg: tokens.accentFg,
          accentSoft: tokens.accentSoft,
          navBg: tokens.navBg,
          navFg: tokens.navFg,
          navFg2: tokens.navFg2,
          navOn: tokens.navOn,
        }}
      />
      <NavProgress />
      <AppShell
        tenantName={auth.active.tenant.name}
        branding={{ displayName: tokens.displayName, logoUrl: tokens.logoUrl }}
        navTone={tokens.navTone}
        navCollapsed={prefs.navCollapsed}
        userEmail={auth.user.email}
        items={items}
        soon={soon}
        openedCodes={openedCodes}
        chatSystemIds={chatSystemIds}
        showTeams={showTeams}
        // รายชื่อกิจการทั้งหมดของ user (สำหรับ dropdown สลับกิจการในหัว drawer)
        memberships={auth.memberships.map((m) => ({ tenantId: m.tenantId, name: m.tenant.name, role: m.role }))}
        activeTenantId={auth.active.tenantId}
      />
      {/* ระยะขอบ (รวมการเว้นที่ให้แถบเมนูปักซ้ายบนจอใหญ่) อยู่ใน AppMain */}
      <AppMain chatSystemIds={chatSystemIds} navCollapsed={prefs.navCollapsed}>
        {children}
      </AppMain>
    </div>
  );
}
