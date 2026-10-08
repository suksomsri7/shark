// การ์ดตัวเลขสรุป (งานวันนี้ · ชั่วโมงที่ประหยัด · % โควตา) — ตัวเลขใหญ่ + ป้ายใต้ · tone เปลี่ยนสีตัวเลข
import { View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";
import { useGlass } from "./glass";

type Props = {
  value: string;
  label: string;
  tone?: "default" | "ok" | "warn" | "danger";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function StatCard({ value, label, tone = "default", style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const glass = useGlass();
  const ink = tone === "ok" ? colors.ok : tone === "warn" ? colors.count : tone === "danger" ? colors.danger : colors.text;
  return (
    <View testID={testID} style={[glass, { flex: 1, borderRadius: tokens.radii.stat, padding: tokens.spacing.statPad }, style]}>
      <TeamText style={[tokens.type.statValue, { color: ink }]} numberOfLines={1}>
        {value}
      </TeamText>
      <TeamText style={[tokens.type.statLabel, { color: colors.textDim, marginTop: tokens.spacing.subTop }]} numberOfLines={1}>
        {label}
      </TeamText>
    </View>
  );
}
