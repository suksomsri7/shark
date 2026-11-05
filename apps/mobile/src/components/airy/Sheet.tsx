// แผ่นล่าง .dim + .sheet — วาดเป็น View วางทับแบบ absolute (Modal ของ RN-web ไม่เรนเดอร์ใน headless)
// แตะพื้นมืด (หรือปุ่มย้อนของ Android) เพื่อปิด · แผ่นมน 48 ขอบห่าง 8
import { useEffect, type ReactNode } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { bgImage, linear, useTheme } from "@/src/theme/index";
import { radii, size } from "@/src/theme/tokens";

// S2.20 (หนี้ S2.4/S2.5 "ชีตโปร่ง"): พื้นทึบ c.surface ใต้ไล่สี + blur บนเว็บ — ไล่สีของธีมโปร่ง 0.9–0.98 ทำให้เห็นรายการข้างหลังทะลุ
//   (มือถือที่ไม่รองรับ experimental_backgroundImage ก็ยังได้พื้นทึบ)
const WEB_BLUR = (Platform.OS === "web" ? { backdropFilter: "blur(24px) saturate(180%)" } : {}) as ViewStyle;

export function Sheet({ visible, onClose, testID, children, top = 120 }: { visible: boolean; onClose?: () => void; testID: string; children?: ReactNode; top?: number }) {
  const { c } = useTheme();
  // R-S2.1f: ปุ่มย้อนของ Android ปิดชีตก่อน (ไม่ย้อนจอข้างหลัง) · เว็บ/iOS ไม่มีผล
  useEffect(() => {
    if (!visible || !onClose) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <View testID={testID} style={StyleSheet.absoluteFill}>
      <Pressable testID={`${testID}-dim`} onPress={onClose} accessibilityRole="button" style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
      <View style={[styles.panel, { top, backgroundColor: c.surface }, WEB_BLUR, bgImage(linear(c.sheet.from, c.sheet.to, 160))]}>
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
