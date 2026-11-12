// HR H2.10 ▸ เมนู/แท็บของระบบ HR ตามผู้ดู (หนี้ VIS-1 "แท็บที่กดแล้ว 404") — ตัวกรองเดียวที่ทั้งเมนูซ้าย (layout.tsx case "HR") และแถบแท็บ (hr/ui.tsx hrTabsFor) ใช้
//   ด่านที่ใช้ = ด่านของหน้าปลายทางตัวเดียวกัน (ไม่เขียนกติกาใหม่): ตารางกะ = canReadRoster · จอลงเวลา = canRunKiosk ·
//   ตั้งค่า/ตารางกฎหมาย = canManageHrSettings · ลงเวลา = ผู้อ่านตารางกะ หรือพนักงานที่ผูกบัญชี (เห็นปฏิทินของตัวเอง — H2.5 Q11) ·
//   ผูกบัญชีกับพนักงาน ⇒ ต่อท้าย "ของฉัน" (/app/me/hr) · รายการต้นทาง (ลำดับ/ป้าย) ไม่เปลี่ยน — กรองออกอย่างเดียว ◂
import { canReadRoster } from "./roster-board";
import { canRunKiosk } from "./clock-settings";
import { canManageHrSettings } from "./settings";

export type HrNavItem = { href: string; label: string };
export type HrNavViewer = { role: string; unitAccess: unknown; permissions: unknown; userId?: string | null };

/** ที่อยู่หน้า "ของฉัน" (บริการตัวเองของพนักงาน — H2.10) */
export const HR_SELF_HREF = "/app/me/hr";
export const HR_SELF_LABEL = "ของฉัน";

type Gate = "roster" | "kiosk" | "settings" | "attendance" | null;
function gateOf(href: string): Gate {
  const path = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (/\/hr\/roster$/.test(path)) return "roster";
  if (/\/hr\/kiosk$/.test(path)) return "kiosk";
  if (/\/hr\/settings(\/law)?$/.test(path)) return "settings";
  if (/\/hr\/attendance$/.test(path)) return "attendance";
  return null;
}

/**
 * รายการเมนู/แท็บ HR ที่ผู้ดูเปิดได้จริง (ลำดับเดิม) + "ของฉัน" เมื่อบัญชีผูกกับพนักงาน
 * `viewer` = บทบาท/สาขา/คีย์ของสมาชิก (ค่าเดียวกับที่หน้าปลายทางใช้ตัดสิน 404) · `linked` = employeeOfUser ของผู้ดูมีแถว
 */
export function hrNavFilter(items: readonly HrNavItem[], viewer: HrNavViewer | null | undefined, opts: { linked: boolean }): HrNavItem[] {
  const v = viewer
    ? { role: viewer.role as "OWNER", unitAccess: viewer.unitAccess, permissions: (viewer.permissions ?? {}) as Record<string, unknown>, userId: viewer.userId ?? null }
    : null;
  const linked = opts?.linked === true;
  const roster = canReadRoster(v);
  const out = (Array.isArray(items) ? items : []).filter((it) => {
    switch (gateOf(it.href)) {
      case "roster":
        return roster;
      case "kiosk":
        return canRunKiosk(v);
      case "settings":
        return canManageHrSettings(v);
      case "attendance":
        return roster || linked;
      default:
        return true;
    }
  });
  return linked ? [...out.map((it) => ({ href: it.href, label: it.label })), { href: HR_SELF_HREF, label: HR_SELF_LABEL }] : out.map((it) => ({ href: it.href, label: it.label }));
}
