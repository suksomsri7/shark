// หัวข้อหมวดตัวเล็ก เว้นช่องไฟตัวอักษร ("แนะนำสำหรับร้านคุณ") — ขวา: ลิงก์/ตัวนับที่ส่งมา
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";

type Props = {
  title: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SectionTitle({ title, right, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  return (
    <View testID={testID} style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: tokens.spacing.sectionTop, marginLeft: tokens.spacing.sectionLeft }, style]}>
      <TeamText accessibilityRole="header" style={[tokens.type.section, { color: colors.section, flexShrink: 1 }]} numberOfLines={1}>
        {title}
      </TeamText>
      {right}
    </View>
  );
}
