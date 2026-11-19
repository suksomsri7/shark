// ขนาดช่องพิมพ์ของห้องแชททีม (B27 · team4.png จอ 4) — แชร์ให้ตัวโฮสต์ปุ่ม Lekaa (เลน wip/b27-fab · โหมด inline-with-composer)
//   ช่องพิมพ์สูง 52 · ปุ่ม Lekaa สูง 52 (รวมวง) อยู่ขวาของช่องพิมพ์ แถวเดียวกัน · ช่องห่าง 10 ⇒ ช่องพิมพ์เว้นขวา 52 + 10 = 62 (+ ขอบจอ 20 = 82 จากขอบ)
//   TODO(b27-fab): ตอน merge ให้โฮสต์อ่าน TEAM_COMPOSER (ความสูง/ระยะจากขอบล่าง) แล้ววางปุ่มในแถวเดียวกัน — จอนี้ไม่วาดปุ่มเอง
import { spacing } from "@/src/theme/tokens";

export const TEAM_COMPOSER_H = 52;
export const TEAM_FAB_GAP = 10;
/** ขอบล่างของช่องพิมพ์ (เหนือ safe-area) */
export const TEAM_COMPOSER_BOTTOM = 26;
export const TEAM_COMPOSER = {
  height: TEAM_COMPOSER_H,
  /** ปุ่ม Lekaa = สูงเท่าช่องพิมพ์ */
  fabSize: TEAM_COMPOSER_H,
  gap: TEAM_FAB_GAP,
  /** ระยะที่ช่องพิมพ์เว้นทางขวา (นับจากขอบจอ) ให้ปุ่ม Lekaa */
  rightInset: spacing.page + TEAM_COMPOSER_H + TEAM_FAB_GAP,
  bottom: TEAM_COMPOSER_BOTTOM,
} as const;
/** รายชื่อทีม: ปุ่ม Lekaa ลอยมุมขวาล่าง (team4.png จอ 1) — เว้นท้ายรายการไม่ให้แถวสุดท้ายโดนบัง */
export const TEAM_LIST_FAB_CLEARANCE = 88;
