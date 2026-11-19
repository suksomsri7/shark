// พื้นจอ Airy (.screen) — สีฐาน + วงไล่สี 4 จุดจากธีม · เว้นขอบบนตาม safe area · S2.13: แถบสถานะตามธีม (ThemedStatusBar)
// 14 พ.ย. (เจ้าของสั่ง iPad): เนื้อหาอยู่ในคอลัมน์กลางกว้างไม่เกิน PAGE_MAX_WIDTH (720) · พื้นไล่สีเต็มจอ · iPhone = เต็มจอเหมือนเดิม
//   ของที่วาง absolute (ช่องพิมพ์ลอย/ปุ่มล่าง) อิงคอลัมน์นี้ ⇒ อยู่กลางจอตามเนื้อหา
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { screenBg, useTheme } from "@/src/theme/index";
import { ThemedStatusBar } from "./ThemedStatusBar";
import { PageColumn } from "@/src/components/ui/page";

/** ขอบบนขั้นต่ำเมื่อเครื่องไม่รายงาน safe area (เว็บ) = แถบสถานะของ iPhone 390×844 */
const MIN_TOP = 47;

export function AiryScreen({ children, testID }: { children?: ReactNode; testID?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} style={[styles.root, screenBg(c), { paddingTop: Math.max(insets.top, MIN_TOP), paddingBottom: insets.bottom }]}>
      <ThemedStatusBar />
      <PageColumn>{children}</PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
});
