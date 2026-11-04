// โซนเลขา AI (ใบ S2.1) — Stack ซ้อนใน Drawer ของกิจการ · ห้องงาน/ตั้งค่า/ทีม/ช่วยเหลือ/ตั้งชื่อเลขา
// ไม่มีแถบล่าง (ไม่ใช้ navigator แบบแท็บ) · ปุ่มกลับย้อนตาม stack จริง (แบบเดียวกับ crm/member ของ 1.0)
// BusinessSwitcherHost = ชีตสลับกิจการชั้นบนสุดของโซน · โหลด secretary/me ครั้งเดียว (ภาษาของจอ + ชื่อเลขา)
import { useEffect } from "react";
import { Stack } from "expo-router";
import { BusinessSwitcherHost } from "@/src/components/secretary/BusinessSwitcherSheet";
import { loadSecretaryMe } from "@/src/api/secretary";
import { useTheme } from "@/src/theme/index";

export default function SecretaryLayout() {
  const { c } = useTheme();
  useEffect(() => {
    void loadSecretaryMe();
  }, []);
  return (
    <BusinessSwitcherHost>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg.base }, animation: "slide_from_right" }} />
    </BusinessSwitcherHost>
  );
}
