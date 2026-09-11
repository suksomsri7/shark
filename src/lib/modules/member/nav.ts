// nav.ts — ทะเบียนเมนูของ "ระบบสมาชิก v2" (M1.3 · พิมพ์เขียว §2.2 · แบบเดียวกับ kanban/nav.ts)
//
// 🔴 ทะเบียนเดียว ใช้ 2 ที่: `memberNavChildren()` ใน `src/app/app/layout.tsx` (drawer ☰)
//    และแถบแท็บในโมดูล (`memberNavItems()` ใน `MemberTabs.tsx`)
//    ถ้าแยกกันพิมพ์ วันหนึ่งเมนู 2 ที่จะไม่ตรงกันแบบเงียบ ๆ (บทเรียนเดียวกับ account/nav.ts · kanban/nav.ts)
//
// status:
//   "ready" = มี `page.tsx` จริงใต้ `src/app/app/sys/[id]/member/**` วันนี้
//   "soon"  = ยังไม่มาถึงตามแผน RUN (MEMBER-RUN.md §1) → แถบแท็บโชว์จาง + ป้าย "เร็ว ๆ นี้" · ไม่ใส่ลงใน drawer
//
// 🔴 v1 เดิม (`import` / `plans` / `tiers` / `subscribe` — สร้างก่อน RUN นี้) ยังมีคนใช้งานจริงอยู่
//    ⇒ `memberNavChildren` ต่อท้ายด้วยลิงก์ 4 อันนี้เสมอ (`LEGACY_V1_LINKS`) จนกว่า WO ที่แทนที่ฟังก์ชันเดียวกัน
//    (M1.10 = ระดับ) จะย้ายผู้ใช้ไปหน้าใหม่แล้วค่อยตัดออกเป็นใบแยก — **ห้ามลบตอนนี้**
// 🔴 M1.5 — `customers` (รายชื่อสมาชิก v1) ตัดออกจากลิสต์นี้แล้ว: `/member/customers` เปลี่ยนเป็น `redirect()`
//    ไปหน้าใหม่ `/member/members` (ไม่ทิ้ง 2 หน้ารายชื่อพร้อมกัน — ดู wo-notes/member-M1.5.md)

import type { MemberActor } from "./access";
import { canManagePrivacy, canManageSettings, canReadMember, hasMemberPerm } from "./access";

export type MemberNavStatus = "ready" | "soon";

export type MemberNavEntry = {
  /** คีย์เสถียรสำหรับ testid/ทดสอบ */
  key: string;
  label: string;
  /** ทางเดินหลัง `/app/sys/{systemId}` */
  path: string;
  status: MemberNavStatus;
  /** WO ที่จะทำหมวดนี้ (โชว์เป็นคำอธิบายในแถบแท็บตอนยัง soon) */
  wo?: string;
};

/** 9 หมวดตาม §2.2 — ลำดับนี้คือลำดับที่ผู้ใช้เห็น */
export const MEMBER_NAV: readonly MemberNavEntry[] = Object.freeze([
  { key: "members", label: "สมาชิก", path: "/member/members", status: "ready" },
  { key: "tiers", label: "ระดับสมาชิก", path: "/member/tiers", status: "ready" },
  { key: "points", label: "แต้ม", path: "/member/points", status: "ready" },
  // M2.3 — หมวดนี้เปิดแล้ว (ตารางใบทั้งหมด + ตัวออกแบบการ์ด + การ์ดจริง)
  { key: "stamps", label: "สแตมป์", path: "/member/stamps", status: "ready" },
  // M2.4 — หมวดนี้เปิดแล้ว (แคตตาล็อก + รอรับ + ตัวออกแบบของรางวัล + แผงรับของหน้าร้าน + ประวัติการแลก)
  { key: "rewards", label: "รางวัล", path: "/member/rewards", status: "ready" },
  // M2.6 — หมวดนี้เปิดแล้วด้วยหน้า hub ที่มีแท็บ Gift Card (voucher/คูปอง มาที่ M2.5 · journey ที่ M3.3)
  { key: "promotions", label: "โปรโมชัน", path: "/member/promotions", status: "ready" },
  // M3.2 — หมวดนี้เปิดแล้ว (ตารางแคมเปญ + ตัวสร้าง 3 ขั้น + หน้าสถิติต่อ variant/กลุ่มเทียบ)
  { key: "campaigns", label: "แคมเปญ", path: "/member/campaigns", status: "ready" },
  { key: "reports", label: "รายงาน", path: "/member/reports", status: "soon", wo: "M3.8" },
  { key: "settings", label: "ตั้งค่า", path: "/member/settings/fields", status: "ready" },
] as const);

/**
 * หน้าย่อยของหมวด "ตั้งค่า" (M1.7) — แถบแท็บย่อยบนหน้าตั้งค่าทุกหน้า
 * 🔴 ทะเบียนเดียวกับ drawer ☰: `memberNavChildren` ต่อท้ายหน้าย่อยที่พร้อมใช้ + ผู้ใช้มีสิทธิ์เข้า
 *    (ไม่งั้นหน้าตั้งค่าความเป็นส่วนตัวจะเป็น "หน้ากำพร้า" ที่เข้าถึงได้ทางเดียวคือพิมพ์ URL เอง)
 * 🔴 "ฟิลด์" ต้องมี `member.settings.manage` · "ความเป็นส่วนตัว" ต้องมี `member.privacy.manage`
 *    (คนละคีย์กัน §6.1 — ผู้จัดการที่ได้สิทธิ์ตั้งฟิลด์ ไม่ได้แปลว่าได้ดูบันทึกการเข้าถึงข้อมูลอ่อนไหวด้วย)
 */
export const MEMBER_SETTINGS_NAV: readonly MemberNavEntry[] = Object.freeze([
  { key: "fields", label: "ฟิลด์", path: "/member/settings/fields", status: "ready" },
  { key: "privacy", label: "ความเป็นส่วนตัว", path: "/member/settings/privacy", status: "ready" },
  { key: "points", label: "แต้ม", path: "/member/points/settings", status: "ready" },
  { key: "sources", label: "ช่องทางที่มา", path: "/member/settings/sources", status: "ready" },
  { key: "notifications", label: "แจ้งเตือน", path: "/member/settings/notifications", status: "soon", wo: "M3.6" },
  { key: "api", label: "API", path: "/member/settings/api", status: "ready" },
] as const);

/**
 * หน้าย่อยของหมวด "แคมเปญ" (M3.1) — ตัวสร้างกลุ่มลูกค้ามาถึงก่อนตัวแคมเปญเอง (M3.2)
 * 🔴 ไม่เพิ่มลง `MEMBER_NAV`: §2.2 ล็อกไว้ 9 หมวด และ "กลุ่มลูกค้า" เป็นขั้นที่ 1 ของการทำแคมเปญ
 *    (ภาพ 21) ไม่ใช่หมวดใหม่ — จึงต่อท้ายใน drawer ☰ แบบเดียวกับหน้าย่อยของหมวดตั้งค่า
 */
/**
 * หน้าลึกของแต่ละหมวด (ไม่ใช่หมวดใหม่ · ไม่ขึ้นแถบแท็บ) — ให้ drawer ☰ กางถึงทุก `page.tsx` ที่ไม่ใช่ [param]
 * 🔴 ด่าน `qc-nav-functions` S5 (completeness): หน้าที่มีเนื้อหาจริงห้ามเป็นหน้ากำพร้าใน accordion
 *    (11 ก.ย. 2569 — เฟส M2 เพิ่มหน้าลึก 13 หน้าแต่ไม่มีใครลงทะเบียน · เพิ่มหน้าใหม่ = เพิ่มที่นี่)
 */
export const MEMBER_DEEP_NAV: readonly MemberNavEntry[] = Object.freeze([
  { key: "members-new", label: "สมัครสมาชิก", path: "/member/members/new", status: "ready" },
  { key: "members-import", label: "นำเข้าสมาชิก", path: "/member/members/import", status: "ready" },
  { key: "members-duplicates", label: "สมาชิกซ้ำ", path: "/member/members/duplicates", status: "ready" },
  { key: "points-adjust", label: "ปรับแต้ม", path: "/member/points/adjust", status: "ready" },
  { key: "points-expiring", label: "แต้มใกล้หมดอายุ", path: "/member/points/expiring", status: "ready" },
  { key: "stamps-new", label: "สร้างสแตมป์การ์ด", path: "/member/stamps/new", status: "ready" },
  { key: "rewards-new", label: "เพิ่มของรางวัล", path: "/member/rewards/new", status: "ready" },
  { key: "rewards-fulfil", label: "รับของรางวัล", path: "/member/rewards/fulfil", status: "ready" },
  { key: "rewards-redemptions", label: "ประวัติการแลก", path: "/member/rewards/redemptions", status: "ready" },
  { key: "promotions-giftcards", label: "Gift Card", path: "/member/promotions/giftcards", status: "ready" },
  { key: "promotions-giftcards-settings", label: "ตั้งค่า Gift Card", path: "/member/promotions/giftcards/settings", status: "ready" },
  { key: "promotions-vouchers", label: "Voucher", path: "/member/promotions/vouchers", status: "ready" },
  { key: "promotions-vouchers-templates", label: "แบบ Voucher", path: "/member/promotions/vouchers/templates", status: "ready" },
  // M3.2 — ตัวสร้างแคมเปญ 3 ขั้น (ตกหล่นตอน M3.2 · qc-nav-functions S5 จับได้ตอน M3.3)
  { key: "campaigns-new", label: "สร้างแคมเปญ", path: "/member/campaigns/new", status: "ready" },
  // M3.3 — ตัวสร้าง journey แบบว่าง (ภาพ 07 บน) · หน้ารายการอยู่ใน MEMBER_CAMPAIGN_NAV
  { key: "journeys-new", label: "สร้าง Journey ใหม่", path: "/member/journeys/new", status: "ready" },
] as const);

export const MEMBER_CAMPAIGN_NAV: readonly MemberNavEntry[] = Object.freeze([
  { key: "segments", label: "กลุ่มลูกค้า", path: "/member/segments", status: "ready" },
  // M3.3 — journey อัตโนมัติ (ภาพ 07 บน · 22) · เงื่อนไขใช้ engine เดียวกับกลุ่มลูกค้า จึงอยู่หมวดเดียวกับแคมเปญ
  { key: "journeys", label: "Journey อัตโนมัติ", path: "/member/journeys", status: "ready" },
] as const);

/** สิทธิ์ที่ต้องมีของหน้าย่อยในหมวดตั้งค่า (ไม่มีในตาราง = ใช้ `member.settings.manage`) */
function canOpenSettingsPage(key: string, actor: MemberActor): boolean {
  if (key === "privacy") return canManagePrivacy(actor);
  // M1.11 — คีย์ API เป็นอีก 1 ใน 4 คีย์ที่ MANAGER ไม่ได้โดยปริยาย (§6.1) · คนละคีย์กับ settings.manage
  //   (ผู้จัดการที่ตั้งฟิลด์ได้ ไม่ได้แปลว่าออกคีย์ที่อ่านฐานลูกค้าทั้งร้านได้ด้วย)
  if (key === "api") return hasMemberPerm(actor, "member.api.manage");
  return canManageSettings(actor);
}

/** หน้าย่อยของ "ตั้งค่า" ที่ actor เปิดได้จริงวันนี้ (แถบแท็บย่อยใช้ตัวนี้ — `soon` ยังโชว์แต่กดไม่ได้) */
export function memberSettingsNavItems(
  systemId: string,
  actor?: MemberActor,
): { key: string; href: string; label: string; status: MemberNavStatus; wo?: string }[] {
  const base = `/app/sys/${systemId}`;
  return MEMBER_SETTINGS_NAV.filter((e) => e.status !== "ready" || !actor || canOpenSettingsPage(e.key, actor)).map((e) => ({
    key: e.key,
    href: e.status === "ready" ? `${base}${e.path}` : "#",
    label: e.label,
    status: e.status,
    ...(e.wo ? { wo: e.wo } : {}),
  }));
}

/** ลิงก์ v1 เดิม — เห็นเสมอไม่ว่าสิทธิ์อะไร (หน้าเดิมมีด่านสิทธิ์ของตัวเองอยู่แล้ว) */
const LEGACY_V1_LINKS: readonly { href: string; label: string }[] = Object.freeze([
  { href: "/member/import", label: "นำเข้า CSV" },
  { href: "/member/plans", label: "แพ็กเกจสมาชิก" },
  { href: "/member/tiers", label: "ระดับสมาชิก (เดิม)" },
  { href: "/member/subscribe", label: "สมัครสมาชิก" },
] as const);

/** หมวดที่ `actor` เห็นวันนี้ — "ตั้งค่า" ต้องมี `member.settings.manage` เพิ่มอีกชั้น (เหมือน "รายงาน" ของบอร์ดงาน) */
function visibleNavEntries(actor?: MemberActor): readonly MemberNavEntry[] {
  return MEMBER_NAV.filter((e) => {
    if (e.status !== "ready") return false;
    if (!actor) return true;
    if (e.key === "settings") return canManageSettings(actor);
    return canReadMember(actor);
  });
}

/** หมวดที่กดเข้าได้จริงวันนี้ (นำหน้าด้วย "หน้าหลัก") + ลิงก์ v1 เดิม 4 อัน — `actor` ไม่ส่ง = ไม่กรอง */
export function memberNavChildren(base: string, actor?: MemberActor): { href: string; label: string }[] {
  // หน้าย่อยของ "ตั้งค่า" — ตัด `fields` ออกเพราะหมวด "ตั้งค่า" ด้านบนพาไปหน้านั้นอยู่แล้ว
  const settingsChildren = MEMBER_SETTINGS_NAV.filter(
    (e) => e.status === "ready" && e.key !== "fields" && (!actor || canOpenSettingsPage(e.key, actor)),
  ).map((e) => ({ href: `${base}${e.path}`, label: e.label }));
  // M3.1 — "กลุ่มลูกค้า" (ขั้นที่ 1 ของการทำแคมเปญ) เห็นได้ถ้าเข้าโมดูลสมาชิกได้
  const campaignChildren = MEMBER_CAMPAIGN_NAV.filter((e) => e.status === "ready" && (!actor || canReadMember(actor))).map((e) => ({
    href: `${base}${e.path}`,
    label: e.label,
  }));
  const deepChildren = MEMBER_DEEP_NAV.filter((e) => e.status === "ready" && (!actor || canReadMember(actor))).map((e) => ({
    href: `${base}${e.path}`,
    label: e.label,
  }));
  return [
    { href: base, label: "หน้าหลัก" },
    ...visibleNavEntries(actor).map((e) => ({ href: `${base}${e.path}`, label: e.label })),
    ...deepChildren,
    ...campaignChildren,
    ...settingsChildren,
    ...LEGACY_V1_LINKS.map((l) => ({ href: `${base}${l.href}`, label: l.label })),
  ];
}

/** ทั้ง 9 หมวดพร้อมสถานะ — แถบแท็บใช้ตัวนี้ ("ตั้งค่า" ที่ไม่มีสิทธิ์ = ไม่โผล่เลย เหมือน "รายงาน" ของบอร์ดงาน) */
export function memberNavItems(
  systemId: string,
  actor?: MemberActor,
): { key: string; href: string; label: string; status: MemberNavStatus; wo?: string }[] {
  const base = `/app/sys/${systemId}`;
  return MEMBER_NAV.filter((e) => e.key !== "settings" || !actor || canManageSettings(actor)).map((e) => ({
    key: e.key,
    href: e.status === "ready" ? `${base}${e.path}` : "#",
    label: e.label,
    status: e.status,
    ...(e.wo ? { wo: e.wo } : {}),
  }));
}
