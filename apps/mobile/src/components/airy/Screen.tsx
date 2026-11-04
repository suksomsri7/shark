// พื้นจอ Airy (.screen) — สีฐาน + วงไล่สี 4 จุดจากธีม · เว้นขอบบนตาม safe area
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { screenBg, useTheme } from "@/src/theme/index";

/** ขอบบนขั้นต่ำเมื่อเครื่องไม่รายงาน safe area (เว็บ) = แถบสถานะของ iPhone 390×844 */
const MIN_TOP = 47;

export function AiryScreen({ children, testID }: { children?: ReactNode; testID?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} style={[styles.root, screenBg(c), { paddingTop: Math.max(insets.top, MIN_TOP), paddingBottom: insets.bottom }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
});
