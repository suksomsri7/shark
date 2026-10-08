// การ์ดแก้ว — พื้น/ขอบ/เงาจากธีม · มี padding ในเสมอ (ความผิดพลาดเดิม: padding 0) · highlighted = ขอบเน้นของรายการแนะนำ
import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/theme";
import { useGlass } from "./glass";

type Props = {
  children: ReactNode;
  highlighted?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function GlassCard({ children, highlighted, onPress, accessibilityLabel, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const glass = useGlass();
  const box: ViewStyle = {
    borderRadius: tokens.radii.card,
    paddingVertical: tokens.spacing.cardPadV,
    paddingHorizontal: tokens.spacing.cardPadH,
  };
  // ขอบเน้นหนากว่าขอบแก้ว → หัก padding ออกเท่าส่วนต่าง เนื้อในจะไม่ขยับ
  const edge: ViewStyle | null = highlighted
    ? {
        borderColor: colors.highlight,
        borderWidth: tokens.border.highlight,
        paddingVertical: tokens.spacing.cardPadV - (tokens.border.highlight - tokens.border.glass),
        paddingHorizontal: tokens.spacing.cardPadH - (tokens.border.highlight - tokens.border.glass),
      }
    : null;
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[glass, box, edge, { minHeight: tokens.size.touchMin }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[glass, box, edge, style]}>
      {children}
    </View>
  );
}
