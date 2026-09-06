// คอลัมน์เนื้อหาบนจอกว้าง (iPad) — iPhone: กว้างเต็มจอเหมือนเดิม · iPad: จำกัด 720 แล้ววางกลาง
// ใช้ครอบ "เนื้อหา" ของจอ native (login / dna / sessions / chat) — WebView dashboard ไม่ต้อง เว็บ responsive เอง
import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

export const PAGE_MAX_WIDTH = 720;

export function useWideScreen(): boolean {
  const { width } = useWindowDimensions();
  return width >= 700;
}

// style ใส่กับ container ใดก็ได้ (View/KeyboardAvoidingView/FlatList) — คอลัมน์กลางจอ ไม่กระทบ iPhone
export const pageColumn = StyleSheet.create({
  column: { width: "100%", maxWidth: PAGE_MAX_WIDTH, alignSelf: "center" },
}).column;

export function PageColumn({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.column, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  column: { flex: 1, width: "100%", maxWidth: PAGE_MAX_WIDTH, alignSelf: "center" },
});
