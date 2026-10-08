// ปุ่มหลัก — พื้น colors.accent · ตัวหนังสือ colors.accentFg (สว่าง #16161c/ขาว · มืด #f2f2f7/#16161c ตาม mockup) · สูง 44 pt = เป้าแตะขั้นต่ำ
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  left?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function PrimaryButton({ label, onPress, disabled, loading, left, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const off = !!disabled || !!loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: tokens.size.touchMin,
          height: tokens.size.button,
          borderRadius: tokens.radii.button,
          paddingHorizontal: tokens.spacing.cardPadH,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: tokens.spacing.buttonGap,
          backgroundColor: disabled ? colors.accentOff : colors.accent,
          boxShadow: disabled ? undefined : colors.accentShadow,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.accentFg} /> : left}
      <TeamText style={[tokens.type.button, { color: disabled ? colors.accentOffFg : colors.accentFg }]} numberOfLines={1}>
        {label}
      </TeamText>
    </Pressable>
  );
}
