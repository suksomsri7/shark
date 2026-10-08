// จอว่าง (ยังไม่มีพนักงาน AI ฯลฯ) — ภาพประกอบ (art) + หัวข้อ + คำอธิบายกลางจอ + ปุ่ม (action) ถ้ามี
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";

type Props = {
  title: string;
  body?: string;
  art?: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function EmptyState({ title, body, art, action, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  return (
    <View testID={testID} style={[{ alignItems: "center" }, style]}>
      {art}
      <TeamText accessibilityRole="header" style={[tokens.type.heroTitle, { color: colors.text, textAlign: "center", marginTop: tokens.spacing.heroTitleTop }]}>
        {title}
      </TeamText>
      {body ? <TeamText style={[tokens.type.heroBody, { color: colors.textDim, textAlign: "center", marginTop: tokens.spacing.heroBodyTop }]}>{body}</TeamText> : null}
      {action ? <View style={{ marginTop: tokens.spacing.heroTop, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}
