// nav.ts — ทะเบียนเมนูของระบบ CRM (สร้างในใบ C1.3 — ใบ UI แรกของ CRM v2 · แบบเดียวกับ member/nav.ts · kanban/nav.ts)
//
// 🔴 ทะเบียนเดียว ใช้ 2 ที่: drawer ☰ (`crmNavChildren()` — จุดต่อใน `src/app/app/layout.tsx` case "CRM") และแถบแท็บในโมดูล
//    (`crmNavItems()` บนหน้าของ CRM) ⇒ ถ้าแยกกันพิมพ์ วันหนึ่งเมนูสองที่จะไม่ตรงกันแบบเงียบ ๆ
// 🔴 ทุก path ที่ status "ready" ต้องมี `page.tsx` จริงใต้ `src/app/app/sys/[id]/crm/**` (ลิงก์ที่กดแล้ว 404 = dead link
//    ที่ `scripts/qc-nav-functions.mts` ห้าม) · ใบ UI ถัดไป (C1.4–C1.11) **ต่อท้าย** รายการของตัวเองที่นี่
// 🔴 ไฟล์นี้บริสุทธิ์ (ไม่แตะ prisma) — client component import ได้

export type CrmNavStatus = "ready" | "soon";

export type CrmNavEntry = {
  /** คีย์เสถียรสำหรับ testid/ทดสอบ */
  key: string;
  label: string;
  /** ทางเดินหลัง `/app/sys/{systemId}` */
  path: string;
  status: CrmNavStatus;
  /** ใบงานที่ทำหมวดนี้ */
  wo?: string;
};

/** หมวดของโมดูล (ลำดับ = ลำดับที่ผู้ใช้เห็น) — ดีล/งานติดตาม/ผู้ติดต่อ = หน้า v1 เดิม · บริษัท = C1.3 */
export const CRM_NAV: readonly CrmNavEntry[] = Object.freeze([
  { key: "deals", label: "ดีล", path: "/crm/deals", status: "ready" },
  { key: "activities", label: "งานติดตาม", path: "/crm/activities", status: "ready" },
  { key: "contacts", label: "ผู้ติดต่อ", path: "/crm/contacts", status: "ready", wo: "C1.4" },
  // C1.3 ▸ รายชื่อบริษัท + บริษัท 360 (`/crm/companies/[companyId]`) + เพิ่มบริษัท
  { key: "companies", label: "บริษัท", path: "/crm/companies", status: "ready", wo: "C1.3" },
] as const);

/**
 * หน้าลึกของแต่ละหมวด (ไม่ใช่หมวดใหม่ · ไม่ขึ้นแถบแท็บ) — drawer ☰ ต้องกางถึงทุก `page.tsx` ที่ไม่ใช่ [param]
 * (ด่าน `qc-nav-functions` S5 completeness — หน้าที่มีเนื้อหาจริงห้ามเป็นหน้ากำพร้า)
 */
export const CRM_DEEP_NAV: readonly CrmNavEntry[] = Object.freeze([
  { key: "companies-new", label: "เพิ่มบริษัท", path: "/crm/companies/new", status: "ready", wo: "C1.3" },
  // C1.4 ▸ เพิ่มผู้ติดต่อ (รายชื่อ `/crm/contacts` = หน้า v2 แล้ว · ผู้ติดต่อ 360 `/crm/contacts/[contactId]` เป็น [param] ไม่ขึ้นเมนู)
  { key: "contacts-new", label: "เพิ่มผู้ติดต่อ", path: "/crm/contacts/new", status: "ready", wo: "C1.4" },
] as const);

/** drawer ☰: หน้าหลักของระบบ + หมวดที่พร้อมใช้ + หน้าลึก */
export function crmNavChildren(base: string): { href: string; label: string }[] {
  return [
    { href: base, label: "ภาพรวม" },
    ...CRM_NAV.filter((e) => e.status === "ready").map((e) => ({ href: `${base}${e.path}`, label: e.label })),
    ...CRM_DEEP_NAV.filter((e) => e.status === "ready").map((e) => ({ href: `${base}${e.path}`, label: e.label })),
  ];
}

/** แถบแท็บในโมดูล (หน้าหลัก + หมวด) */
export function crmNavItems(systemId: string): { href: string; label: string }[] {
  const base = `/app/sys/${systemId}`;
  return [{ href: base, label: "ภาพรวม" }, ...CRM_NAV.filter((e) => e.status === "ready").map((e) => ({ href: `${base}${e.path}`, label: e.label }))];
}
