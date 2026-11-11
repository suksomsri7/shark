// shim ของจอ 1.0 — ค่า C/R/S เดิมทุกตัว (ย้ายไปอยู่ใน src/theme/light.ts + tokens.ts) · จอ 1.0 import ไฟล์นี้เหมือนเดิม
// จอใหม่ของเลขา AI ใช้ "@/src/theme/index" (useTheme) แทน
import { legacyLight } from "./theme/light";
import { legacyR, legacyS } from "./theme/tokens";

export const C = legacyLight;
export const R = legacyR; // radius
export const S = legacyS; // spacing
