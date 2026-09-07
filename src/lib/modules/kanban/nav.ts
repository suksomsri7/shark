// nav.ts — ทะเบียนเมนูของระบบบอร์ดงาน (K1.14 · แบบ §5.2 "เมนูโมดูล 7 หมวด")
//
// 🔴 ทะเบียนเดียว ใช้ 2 ที่: `childrenFor("KANBAN")` ใน `src/app/app/layout.tsx` (drawer ☰)
//    และแถบแท็บในโมดูล (`kanbanTabs`/`KanbanNavTabs` ใน `ui.tsx`)
//    ถ้าแยกกันพิมพ์ วันหนึ่งเมนู 2 ที่จะไม่ตรงกันแบบเงียบ ๆ (แบบเดียวกับที่ `account/nav.ts` แก้ไว้แล้ว)
//
// status:
//   "ready" = มี `page.tsx` จริงใต้ `src/app/app/sys/[id]/kanban/**` วันนี้
//   "soon"  = ยังไม่มาถึงตามแผน (P2) → แถบแท็บโชว์จาง + ป้าย "เร็ว ๆ นี้" · **ไม่ใส่ลงใน drawer**
//             (drawer เป็นลิงก์ล้วน — ลิงก์ที่กดแล้ว 404 คือ dead link ที่ `qc-nav-functions.mts` ห้าม)
//
// ⚠️ ย้ายหมวดไหนจาก "soon" → "ready" ต้องสร้าง `page.tsx` ของหมวดนั้นใน commit เดียวกัน
//
// K2.10: หมวด "รายงาน" ต่างจากหมวดอื่น — มีหน้าจริงแล้วก็จริง แต่ยัง "ซ่อน" ได้อีกชั้นสำหรับคนที่ไม่มีคีย์
// `kanban.report.view` (OWNER ผ่านเสมอ) — ตรวจผ่าน `canViewReports()` ของ `access.ts` (ไฟล์บริสุทธิ์ ไม่แตะ
// prisma ⇒ import ตรงนี้ได้แม้ `KanbanTabs.tsx` เป็น client component) ทั้ง `kanbanNavChildren` (drawer ☰)
// และ `kanbanNavItems` (แถบแท็บ) ต้องกรองด้วยฟังก์ชันเดียวกัน ไม่งั้นสองที่จะไม่ตรงกัน (เหตุผลเดียวกับข้างบน)

import { canViewReports } from "./access";
import type { KanbanActor } from "./types";

export type KanbanNavStatus = "ready" | "soon";

export type KanbanNavEntry = {
  /** คีย์เสถียรสำหรับ testid/ทดสอบ */
  key: string;
  label: string;
  /** ทางเดินหลัง `/app/sys/{systemId}` — "" = หน้าภาพรวมของระบบ */
  path: string;
  status: KanbanNavStatus;
  /** WO ที่จะทำหมวดนี้ (โชว์เป็นคำอธิบายในแถบแท็บตอนยัง soon) */
  wo?: string;
};

/** 7 หมวดตามแบบ §5.2 — ลำดับนี้คือลำดับที่ผู้ใช้เห็น (บอร์ดมาก่อน = หน้าเริ่มต้นของหัวหน้า) */
export const KANBAN_NAV: readonly KanbanNavEntry[] = Object.freeze([
  { key: "boards", label: "บอร์ด", path: "/kanban/boards", status: "ready" },
  { key: "my-tasks", label: "งานของฉัน", path: "/kanban/my-tasks", status: "ready" },
  // K2.8 — กล่องงานเข้าเป็นคอลัมน์ซ้ายของหน้า "งานของฉัน" (ไม่ใช่หน้าแยก) ⇒ ชี้ไป `#inbox` ของหน้านั้น
  { key: "inbox", label: "กล่องงานเข้า", path: "/kanban/my-tasks#inbox", status: "ready" },
  // K2.12: ปฏิทินรวมทุกบอร์ดที่มองเห็น (`system-calendar.ts#listSystemCalendar`) — ปลด "เร็ว ๆ นี้"
  { key: "calendar", label: "ปฏิทินงาน", path: "/kanban/calendar", status: "ready" },
  { key: "automation", label: "ระบบอัตโนมัติ", path: "/kanban/automation", status: "ready" },
  { key: "reports", label: "รายงาน", path: "/kanban/reports", status: "ready" },
  // K1.15 เปิดหมวดนี้แล้ว (ส่วน "API" — ออกคีย์ให้ระบบภายนอก/ผู้ช่วย AI) · ส่วนที่เหลือมาใน K2.5
  { key: "settings", label: "ตั้งค่า", path: "/kanban/settings", status: "ready" },
] as const);

/** หมวดที่ `actor` เห็นในเมนูวันนี้ — "รายงาน" ต้องผ่าน `canViewReports()` เพิ่มอีกชั้นนอกจาก status ready */
function visibleNavEntries(actor?: KanbanActor): readonly KanbanNavEntry[] {
  return KANBAN_NAV.filter((e) => e.status === "ready" && (e.key !== "reports" || !actor || canViewReports(actor)));
}

/** หมวดที่กดเข้าได้จริงวันนี้ (นำหน้าด้วย "ภาพรวม" = หน้า hub ของระบบ) — `actor` ไม่ส่ง = ไม่กรองรายงาน (เผื่อผู้เรียกเดิม) */
export function kanbanNavChildren(base: string, actor?: KanbanActor): { href: string; label: string }[] {
  return [
    { href: base, label: "ภาพรวม" },
    ...visibleNavEntries(actor).map((e) => ({ href: `${base}${e.path}`, label: e.label })),
  ];
}

/** ทั้ง 7 หมวดพร้อมสถานะ — แถบแท็บในโมดูลใช้ตัวนี้ (หมวดที่ยังไม่มาโชว์ป้าย "เร็ว ๆ นี้" · "รายงาน" ที่ไม่มีสิทธิ์ = ไม่โผล่เลย) */
export function kanbanNavItems(systemId: string, actor?: KanbanActor): { key: string; href: string; label: string; status: KanbanNavStatus; wo?: string }[] {
  const base = `/app/sys/${systemId}`;
  return KANBAN_NAV.filter((e) => e.key !== "reports" || !actor || canViewReports(actor)).map((e) => ({
    key: e.key,
    href: e.status === "ready" ? `${base}${e.path}` : "#",
    label: e.label,
    status: e.status,
    ...(e.wo ? { wo: e.wo } : {}),
  }));
}
