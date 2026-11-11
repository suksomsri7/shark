// สร้างกิจการใหม่จากแอปเลขา (ใบ S2.1 · แบบ G1) — Stack ซ้อนใน Drawer ของกิจการ
// ไม่มีแถบล่าง (ไม่ใช้ navigator แบบแท็บ) · ปุ่มกลับย้อนตาม stack จริง (แบบเดียวกับ crm/member ของ 1.0)
// BusinessSwitcherHost = ชีตสลับกิจการชั้นบนสุดของโซน · useSecretaryZone = secretary/me ต่อผู้ใช้ + badge กลาง
// S2.13: StatusBar ตามธีม (ThemedStatusBar — useTheme · ถอดเมื่อโซนหลุด focus ⇒ จอ 1.0 กลับเป็น style="dark")
import { Stack } from "expo-router";
import { BusinessSwitcherHost } from "@/src/components/secretary/BusinessSwitcherSheet";
import { useSecretaryZone } from "@/src/api/secretary";
import { useTheme } from "@/src/theme/index";
import { ThemedStatusBar } from "@/src/components/airy/ThemedStatusBar";

export default function BusinessLayout() {
  const { c } = useTheme();
  useSecretaryZone(); // R-S2.1b/e: secretary/me ต่อ user.id + badge ของโซน (focus/foreground)
  return (
    <BusinessSwitcherHost root="/secretary">
      <ThemedStatusBar />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg.base }, animation: "slide_from_right" }} />
    </BusinessSwitcherHost>
  );
}
