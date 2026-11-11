// แถบสถานะตามธีม Airy (ใบ S2.13 · REVIEW C17) — มืด ⇒ ตัวอักษรสว่าง · สว่าง ⇒ ตัวอักษรเข้ม
// แสดงเฉพาะตอนจอ/โซนนี้ focus: หลุด focus (ไปจอ 1.0 ใน drawer) ⇒ ถอดออก ⇒ StatusBar style="dark" ของ root (1.0) กลับมาเอง
// (StatusBar ของ RN เป็น stack — ตัวที่ mount ล่าสุดชนะ · โซนเลขาค้าง mount ใน drawer จึงต้องถอดตอน blur)
import { StatusBar } from "expo-status-bar";
import { useIsFocused } from "expo-router";
import { useTheme } from "@/src/theme/index";

export function ThemedStatusBar() {
  const { scheme } = useTheme();
  const focused = useIsFocused();
  return focused ? <StatusBar style={scheme === "dark" ? "light" : "dark"} /> : null;
}
