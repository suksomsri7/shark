import { cookies } from "next/headers";
import { ACC_MODE_COOKIE, type AccMode } from "./mode-shared";

// โหมดง่าย/นักบัญชี (BLUEPRINT-ACCOUNT-V2 §0.3-1) — เก็บ cookie ฝั่ง server อ่านได้ (SSR ตัดสินใจว่าจะซ่อนช่องไหน)
// client sync กับ localStorage คู่กันใน EasyModeToggle.tsx (ต้องอ่านได้เร็วกว่ารอ round-trip ไป server)
export { ACC_MODE_COOKIE };
export type { AccMode };

/** อ่านโหมดปัจจุบันฝั่ง server (default = โหมดง่าย) */
export async function getAccMode(): Promise<AccMode> {
  const jar = await cookies();
  const v = jar.get(ACC_MODE_COOKIE)?.value;
  return v === "accountant" ? "accountant" : "easy";
}
