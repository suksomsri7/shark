// S2.14 สถานะโหลด/ล้มของจอ S2 (ใบ S2.14 งาน 1 · ภาพสถานะ qc/shots-sec/s2.14-states)
//   <Loading testID> = ตัวหมุน + "กำลังโหลด…" (ก่อนผลแรกมาถึง — ห้ามแสดงข้อความ "ว่าง/ไม่มี" ระหว่างนี้)
//   <LoadError testID onRetry> = ข้อความล้ม (ไม่โทษผู้ใช้) + ปุ่มลองใหม่ `${testID}-retry` (ไม่ส่ง onRetry = ไม่มีปุ่ม · จอที่ poll เองอยู่แล้ว)
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useT } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";
import { Icon } from "./Icon";

export function Loading({ testID, label, style }: { testID: string; label?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={[styles.loading, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? t("sec.state.loading")}>
      <ActivityIndicator size="small" color={c.iconDim} />
      <Text style={[styles.loadingT, { color: c.textMuted }]}>{label ?? t("sec.state.loading")}</Text>
    </View>
  );
}

export function LoadError({ testID, onRetry, message, style }: { testID: string; onRetry?: () => void; message?: string | null; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={[glassStyle(c, radii.sugg), styles.err, style]}>
      <Icon name="wifi-off" size={20} color={c.warn.fg} />
      <Text style={[styles.errT, { color: c.text }]}>{message || t("sec.state.error")}</Text>
      {onRetry ? (
        <Pressable testID={`${testID}-retry`} onPress={onRetry} accessibilityRole="button" style={[styles.retry, { backgroundColor: c.accent }]}>
          <Text style={[styles.retryT, { color: c.onAccent }]}>{t("sec.state.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 28 },
  loadingT: { fontSize: T.sub },
  err: { alignItems: "center", gap: 10, paddingVertical: 20, paddingHorizontal: 18, marginTop: 16 },
  errT: { fontSize: T.sub + 0.5, fontWeight: "600", textAlign: "center", lineHeight: 21 },
  retry: { borderRadius: radii.pill, paddingVertical: 9, paddingHorizontal: 20 },
  retryT: { fontSize: T.sub, fontWeight: "700" },
});
