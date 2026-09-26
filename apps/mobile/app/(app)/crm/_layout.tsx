// โซน "CRM" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13) — Stack ซ้อนใน Drawer ของกิจการ (expo-router เท่านั้น · ห้าม @react-navigation/*)
// ดีลของฉัน (index) · งานวันนี้ (tasks) · บันทึกสาย (call-log — เด้งเองหลังวางสาย) · สแกนนามบัตร (scan-card)
// useCallPrompt: กดโทรจากการ์ดดีล → กลับเข้าแอป (AppState active) → เปิดแผ่นบันทึกสายพร้อมระยะเวลา
import { Stack } from "expo-router";
import { useCallPrompt } from "@/src/lib/call-prompt";
import { C } from "@/src/theme";

export default function CrmLayout() {
  useCallPrompt();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: "slide_from_right" }} />;
}
