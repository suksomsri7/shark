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
  { key: "inbox", label: "กล่องงานเข้า", path: "/kanban/inbox", status: "soon", wo: "K2.8" },
  { key: "calendar", label: "ปฏิทินงาน", path: "/kanban/calendar", status: "soon", wo: "K2.2" },
  { key: "automation", label: "ระบบอัตโนมัติ", path: "/kanban/automation", status: "soon", wo: "K2.9" },
  { key: "reports", label: "รายงาน", path: "/kanban/reports", status: "soon", wo: "K2.10" },
  { key: "settings", label: "ตั้งค่า", path: "/kanban/settings", status: "soon", wo: "K2.5" },
] as const);

/** หมวดที่กดเข้าได้จริงวันนี้ (นำหน้าด้วย "ภาพรวม" = หน้า hub ของระบบ) */
export function kanbanNavChildren(base: string): { href: string; label: string }[] {
  return [
    { href: base, label: "ภาพรวม" },
    ...KANBAN_NAV.filter((e) => e.status === "ready").map((e) => ({ href: `${base}${e.path}`, label: e.label })),
  ];
}

/** ทั้ง 7 หมวดพร้อมสถานะ — แถบแท็บในโมดูลใช้ตัวนี้ (หมวดที่ยังไม่มาโชว์ป้าย "เร็ว ๆ นี้") */
export function kanbanNavItems(systemId: string): { key: string; href: string; label: string; status: KanbanNavStatus; wo?: string }[] {
  const base = `/app/sys/${systemId}`;
  return KANBAN_NAV.map((e) => ({
    key: e.key,
    href: e.status === "ready" ? `${base}${e.path}` : "#",
    label: e.label,
    status: e.status,
    ...(e.wo ? { wo: e.wo } : {}),
  }));
}
