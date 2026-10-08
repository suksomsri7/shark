// shim — ธีมย้ายไปอยู่ใน ./theme/* แล้ว (T0.3) · จอ 1.0 ยัง `import { C, R, S } from "@/src/theme"` ได้เหมือนเดิม (object ตัวเดียวกับ theme/index.ts)
// `@/src/theme` ชี้มาที่ไฟล์นี้ก่อนโฟลเดอร์ → ส่งต่อทุกอย่างของ theme/index (C R S · tokens · light · dark · useTheme · get/setThemeOverride)
export * from "./theme/index";
