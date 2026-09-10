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
// 🔴 v1 เดิม (`customers` / `import` / `plans` / `tiers` / `subscribe` — สร้างก่อน RUN นี้) ยังมีคนใช้งานจริงอยู่
//    ⇒ `memberNavChildren` ต่อท้ายด้วยลิงก์ 5 อันนี้เสมอ (`LEGACY_V1_LINKS`) จนกว่า WO ที่แทนที่ฟังก์ชันเดียวกัน
//    (M1.5 = สมาชิก · M1.10 = ระดับ) จะย้ายผู้ใช้ไปหน้าใหม่แล้วค่อยตัดออกเป็นใบแยก — **ห้ามลบตอนนี้**

import type { MemberActor } from "./access";
import { canManageSettings, canReadMember } from "./access";

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
  { key: "members", label: "สมาชิก", path: "/member/members", status: "soon", wo: "M1.5" },
  { key: "tiers", label: "ระดับสมาชิก", path: "/member/tiers", status: "soon", wo: "M1.10" },
  { key: "points", label: "แต้ม", path: "/member/points", status: "soon", wo: "M2.2" },
  { key: "stamps", label: "สแตมป์", path: "/member/stamps", status: "soon", wo: "M2.3" },
  { key: "rewards", label: "รางวัล", path: "/member/rewards", status: "soon", wo: "M2.4" },
  { key: "promotions", label: "โปรโมชัน", path: "/member/promotions", status: "soon", wo: "M2.5" },
  { key: "campaigns", label: "แคมเปญ", path: "/member/campaigns", status: "soon", wo: "M3.2" },
  { key: "reports", label: "รายงาน", path: "/member/reports", status: "soon", wo: "M3.8" },
  { key: "settings", label: "ตั้งค่า", path: "/member/settings/fields", status: "ready" },
] as const);

/** ลิงก์ v1 เดิม — เห็นเสมอไม่ว่าสิทธิ์อะไร (หน้าเดิมมีด่านสิทธิ์ของตัวเองอยู่แล้ว) */
const LEGACY_V1_LINKS: readonly { href: string; label: string }[] = Object.freeze([
  { href: "/member/customers", label: "รายชื่อสมาชิก" },
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

/** หมวดที่กดเข้าได้จริงวันนี้ (นำหน้าด้วย "หน้าหลัก") + ลิงก์ v1 เดิม 5 อัน — `actor` ไม่ส่ง = ไม่กรอง */
export function memberNavChildren(base: string, actor?: MemberActor): { href: string; label: string }[] {
  return [
    { href: base, label: "หน้าหลัก" },
    ...visibleNavEntries(actor).map((e) => ({ href: `${base}${e.path}`, label: e.label })),
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
