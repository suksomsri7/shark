import { cookies } from "next/headers";
import { ACC_MODE_COOKIE, type AccMode } from "./mode-shared";

// โหมดง่าย/นักบัญชี (BLUEPRINT-ACCOUNT-V2 §0.3-1) — เก็บ cookie ฝั่ง server อ่านได้ (SSR ตัดสินใจว่าจะซ่อนช่องไหน)
// client sync กับ localStorage คู่กันใน EasyModeToggle.tsx (ต้องอ่านได้เร็วกว่ารอ round-trip ไป server)
export { ACC_MODE_COOKIE };
export type { AccMode };

/** อ่านโหมดปัจจุบันฝั่ง server — **ค่าเริ่มต้น = โหมดนักบัญชี** (ตรงกับ readInitialMode ฝั่ง client)
 *  เหตุผล: ภาพที่เจ้าของอนุมัติ (g1 · g17) วาดฟอร์มโหมดเต็ม (มีบัญชี · ประเภทราคา · หัก ณ ที่จ่าย)
 *  ถ้า default เป็น "ง่าย" หน้าจริงจะไม่เหมือนแบบตั้งแต่เปิดครั้งแรก */
export async function getAccMode(): Promise<AccMode> {
  const jar = await cookies();
  const v = jar.get(ACC_MODE_COOKIE)?.value;
  return v === "easy" ? "easy" : "accountant";
}
