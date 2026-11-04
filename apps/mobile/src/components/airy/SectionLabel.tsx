// หัวข้อกลุ่ม .sec — ตัวเล็ก หนา จาง เว้นตัวอักษร
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useTheme } from "@/src/theme/index";

export function SectionLabel({ children, style, testID }: { children: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const { c } = useTheme();
  return (
    <Text testID={testID} style={[styles.t, { color: c.textFaint }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  t: { fontSize: 13, fontWeight: "600", letterSpacing: 1.2, marginLeft: 10, marginTop: 34 },
});
