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
  { key: "deals", label: "ดีล", path: "/crm/deals", status: "ready", wo: "C1.5" },
  { key: "activities", label: "งานติดตาม", path: "/crm/activities", status: "ready" },
  { key: "contacts", label: "ผู้ติดต่อ", path: "/crm/contacts", status: "ready", wo: "C1.4" },
  // C1.3 ▸ รายชื่อบริษัท + บริษัท 360 (`/crm/companies/[companyId]`) + เพิ่มบริษัท
  { key: "companies", label: "บริษัท", path: "/crm/companies", status: "ready", wo: "C1.3" },
  // CRM C1.6 ▸ ปฏิทินกิจกรรม (วัน | สัปดาห์ | เดือน · ของฉัน/ทีม) — หน้า "งานติดตาม" ข้างบนเป็นกิจกรรม v2 แล้ว
  { key: "calendar", label: "ปฏิทิน", path: "/crm/calendar", status: "ready", wo: "C1.6" },
  // ◂ CRM C1.6
  // CRM C2.5 ▸ กล่องจดหมาย (จดหมายเข้า/ออกของลูกค้า + กล่อง "ยังไม่จับคู่") — เธรด `/crm/emails/[threadKey]`
  //   เป็น [param] จึงไม่ขึ้นเมนู · คีย์ `crm.email.read` (STAFF ได้ปริยาย §6.1 ⇒ แท็บนี้ไม่ใช่ลิงก์ตายสำหรับพนักงาน)
  { key: "emails", label: "อีเมล", path: "/crm/emails", status: "ready", wo: "C2.5" },
  // ◂ CRM C2.5
] as const);

/**
 * หน้าลึกของแต่ละหมวด (ไม่ใช่หมวดใหม่ · ไม่ขึ้นแถบแท็บ) — drawer ☰ ต้องกางถึงทุก `page.tsx` ที่ไม่ใช่ [param]
 * (ด่าน `qc-nav-functions` S5 completeness — หน้าที่มีเนื้อหาจริงห้ามเป็นหน้ากำพร้า)
 */
export const CRM_DEEP_NAV: readonly CrmNavEntry[] = Object.freeze([
  { key: "companies-new", label: "เพิ่มบริษัท", path: "/crm/companies/new", status: "ready", wo: "C1.3" },
  // C1.4 ▸ เพิ่มผู้ติดต่อ (รายชื่อ `/crm/contacts` = หน้า v2 แล้ว · ผู้ติดต่อ 360 `/crm/contacts/[contactId]` เป็น [param] ไม่ขึ้นเมนู)
  { key: "contacts-new", label: "เพิ่มผู้ติดต่อ", path: "/crm/contacts/new", status: "ready", wo: "C1.4" },
  // CRM C1.5 ▸ ดีล v2: เพิ่มดีล · pipeline ทั้งหมด · ตั้งค่า pipeline/ขั้น/เหตุผลที่แพ้ (กระดาน `/crm/deals` = หมวดข้างบน · ดีล 360 เป็น [param])
  { key: "deals-new", label: "เพิ่มดีล", path: "/crm/deals/new", status: "ready", wo: "C1.5" },
  { key: "pipelines", label: "pipeline ทั้งหมด", path: "/crm/pipelines", status: "ready", wo: "C1.5" },
  { key: "settings-pipelines", label: "ตั้งค่า pipeline", path: "/crm/settings/pipelines", status: "ready", wo: "C1.5" },
  { key: "settings-stages", label: "ตั้งค่าขั้นของดีล", path: "/crm/settings/stages", status: "ready", wo: "C1.5" },
  { key: "settings-lost-reasons", label: "เหตุผลที่แพ้", path: "/crm/settings/lost-reasons", status: "ready", wo: "C1.5" },
  // ◂ CRM C1.5
  // CRM C1.7 ▸ การมองเห็นข้อมูล (บทบาท × ชนิดข้อมูล + ตั้งทับต่อทีม/pipeline) — ทีมขายอยู่หน้า core `/app/settings/teams` (drawer ตั้งค่า)
  { key: "settings-visibility", label: "การมองเห็นข้อมูล", path: "/crm/settings/visibility", status: "ready", wo: "C1.7" },
  // ◂ CRM C1.7
  // CRM C1.9 ▸ วัตถุกำหนดเอง (รายการวัตถุ + ตัวออกแบบฟิลด์) — หน้ารายการ `/crm/objects/[key]` และรายการเดี่ยวเป็น [param] ไม่ขึ้นเมนู
  { key: "settings-objects", label: "วัตถุกำหนดเอง", path: "/crm/settings/objects", status: "ready", wo: "C1.9" },
  // รีวิว S3 + มติผู้คุมงาน: สารบัญ "ข้อมูลกำหนดเอง" อยู่ใน drawer เท่านั้น (layout.tsx ด่าน crm.record.read) — ไม่ขึ้นแถบแท็บ (ไม่มีลิงก์ที่ 404)
  { key: "objects", label: "ข้อมูลกำหนดเอง", path: "/crm/objects", status: "ready", wo: "C1.9" },
  // ◂ CRM C1.9
  // CRM C1.10 ▸ ตั้งค่า CRM (หน้ารวมการ์ดตั้งค่า · หนี้ C1.5 R-A) · API และ webhook (คีย์ · curl · เครื่องมือ AI · ฮุค + ประวัติการส่ง)
  { key: "settings", label: "ตั้งค่า CRM", path: "/crm/settings", status: "ready", wo: "C1.10" },
  { key: "settings-api", label: "API และ webhook", path: "/crm/settings/api", status: "ready", wo: "C1.10" },
  // ◂ CRM C1.10
  // CRM C1.11 ▸ นำเข้าผู้ติดต่อ+บริษัท (CSV จับคู่คอลัมน์) · ผู้ติดต่อที่น่าจะซ้ำ · บริษัทที่น่าจะซ้ำ (รวมแบบเลือกค่าต่อฟิลด์)
  { key: "contacts-import", label: "นำเข้าผู้ติดต่อ", path: "/crm/contacts/import", status: "ready", wo: "C1.11" },
  { key: "contacts-duplicates", label: "ผู้ติดต่อที่น่าจะซ้ำ", path: "/crm/contacts/duplicates", status: "ready", wo: "C1.11" },
  { key: "companies-duplicates", label: "บริษัทที่น่าจะซ้ำ", path: "/crm/companies/duplicates", status: "ready", wo: "C1.11" },
  // ◂ CRM C1.11
  // CRM C2.1 ▸ กฎอัตโนมัติ CRM (ตัวสร้างกฎประโยคไทย · กฎเริ่มต้น 6 · ทดลองรัน · บันทึกการทำงาน — ภาพ 07 บน)
  { key: "settings-automation", label: "กฎอัตโนมัติ", path: "/crm/settings/automation", status: "ready", wo: "C2.1" },
  // ◂ CRM C2.1
  // CRM C2.2 ▸ ลำดับการติดตาม (รายการ + ตัวแก้ไข `/crm/settings/sequences/[sequenceId]` เป็น [param] ไม่ขึ้นเมนู)
  //   + วันทำการ/วันหยุดที่ขั้น "รอ" ใช้นับ (ภาพ 07 ล่าง)
  { key: "settings-sequences", label: "ลำดับการติดตาม", path: "/crm/settings/sequences", status: "ready", wo: "C2.2" },
  { key: "settings-holidays", label: "วันทำการและวันหยุด", path: "/crm/settings/holidays", status: "ready", wo: "C2.2" },
  // ◂ CRM C2.2
  // CRM C2.3 ▸ มอบหมาย lead อัตโนมัติ (กฎตามลำดับ · วิธีแจก 4 แบบ · ผู้รับสำรอง · ทดลอง — ภาพ 07 ขวา)
  { key: "settings-assignment", label: "มอบหมายอัตโนมัติ", path: "/crm/settings/assignment", status: "ready", wo: "C2.3" },
  // ◂ CRM C2.3
  // CRM C2.5 ▸ ตั้งค่าอีเมล (เส้นทางส่ง/รับ · โดเมนผู้ส่ง · สำเนา · การติดตาม · ทับค่าต่อผู้ใช้ · แม่แบบ — ภาพ 15)
  { key: "settings-email", label: "ตั้งค่าอีเมล", path: "/crm/settings/email", status: "ready", wo: "C2.5" },
  // ◂ CRM C2.5
  // CRM C2.6 ▸ ติดตามเว็บ + ลิงก์ติดตาม (ภาพ 16 + ภาพ 11) · ฟอร์ม → CRM (ระบบปลายทาง/กฎมอบหมาย/คะแนน/กันสแปม/โค้ดฝัง)
  { key: "settings-tracking", label: "ติดตามเว็บและลิงก์", path: "/crm/settings/tracking", status: "ready", wo: "C2.6" },
  { key: "settings-forms", label: "ฟอร์มรับลูกค้า", path: "/crm/settings/forms", status: "ready", wo: "C2.6" },
  // CRM C2.8 ▸ คะแนนผู้ติดต่อ (กฎให้คะแนน · ระดับ ร้อน/อุ่น/เย็น · อายุของแต้ม · คำนวณใหม่) — คีย์ `crm.score.manage` ◂
  { key: "settings-scoring", label: "คะแนนผู้ติดต่อ", path: "/crm/settings/scoring", status: "ready", wo: "C2.8" },
  // ◂ CRM C2.6
  // CRM C2.10 ▸ ตั้งค่าการแจ้งเตือน (เทมเพลต 10 เรื่อง × 3 ช่องทาง + ช่วงห้ามรบกวนของร้าน = คีย์ `crm.settings.manage`
  //   · แท็บ "ของฉัน" ไม่ต้องมีคีย์ — พนักงานทุกคนตั้งค่าของตัวเองได้ · มติ C22) ◂
  { key: "settings-notifications", label: "การแจ้งเตือน", path: "/crm/settings/notifications", status: "ready", wo: "C2.10" },
  // ◂ CRM C2.10
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
