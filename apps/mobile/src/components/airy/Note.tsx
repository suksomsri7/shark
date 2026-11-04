// ข้อความกำกับ .note (กลางจอ จาง) · `warn` = กล่องเหตุผล .why (พื้นเหลืองจาง)
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

export function Note({ children, warn = false, style, testID }: { children: string; warn?: boolean; style?: StyleProp<TextStyle>; testID?: string }) {
  const { c } = useTheme();
  return (
    <Text testID={testID} style={[warn ? [styles.why, { color: c.warn.fg, backgroundColor: c.warn.bg }] : [styles.note, { color: c.textMuted }], style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13.5, textAlign: "center", lineHeight: 21.6, marginTop: 16 },
  why: { fontSize: 13, lineHeight: 19.5, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12, overflow: "hidden" },
});
