// โซน "สมาชิก" ของแอปพนักงาน (M3.11 · ภาพ 28) — Stack ซ้อนใน Drawer ของกิจการ
// ค้น/สแกน (index) → สรุปสมาชิก ([customerId]) → ประทับสแตมป์ (stamp) · ปุ่มกลับย้อนตาม stack จริง
// (ถ้าวางเป็นจอของ Drawer ตรง ๆ "กลับ" จะเด้งไปหน้าแรกของ Drawer แทนจอก่อนหน้า)
import { Stack } from "expo-router";
import { C } from "@/src/theme";

export default function MemberLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: "slide_from_right" }} />;
}
