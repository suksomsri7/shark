import { cookies } from "next/headers";
import { DASH_COLLAPSE_COOKIE } from "./dash-collapse-shared";

// อ่านสถานะ "ย่อ/ขยาย" ของหน้าหลัก (WO 2.2 §4 หัวข้อ 1) ฝั่ง server — ค่าเริ่มต้น = ขยาย (false)
// sync กับ localStorage คู่กันใน DashCollapseToggle.tsx (เหมือน mode.ts/EasyModeToggle.tsx)
export async function getDashCollapsed(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(DASH_COLLAPSE_COOKIE)?.value === "1";
}
