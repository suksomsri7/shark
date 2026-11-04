// แผ่นล่าง .dim + .sheet — วาดเป็น View วางทับแบบ absolute (Modal ของ RN-web ไม่เรนเดอร์ใน headless)
// แตะพื้นมืดเพื่อปิด · แผ่นมน 48 ขอบห่าง 8
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { bgImage, linear, useTheme } from "@/src/theme/index";
import { radii, size } from "@/src/theme/tokens";

export function Sheet({ visible, onClose, testID, children, top = 120 }: { visible: boolean; onClose?: () => void; testID: string; children?: ReactNode; top?: number }) {
  const { c } = useTheme();
  if (!visible) return null;
  return (
    <View testID={testID} style={StyleSheet.absoluteFill}>
      <Pressable testID={`${testID}-dim`} onPress={onClose} accessibilityRole="button" style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
      <View style={[styles.panel, { top }, bgImage(linear(c.sheet.from, c.sheet.to, 160))]}>
        <View style={[styles.grab, { backgroundColor: c.sheet.grab }]} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: "absolute", left: 8, right: 8, bottom: 8, borderRadius: radii.sheet, paddingVertical: 14, paddingHorizontal: 24, overflow: "hidden" },
  grab: { alignSelf: "center", width: 44, height: size.grab, borderRadius: 3, marginBottom: 12 },
});
