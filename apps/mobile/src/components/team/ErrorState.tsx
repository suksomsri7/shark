// จอผิดพลาด — ข้อความ (ไทย ไม่โทษผู้ใช้ · ส่งมาจากจอ) + ปุ่ม "ลองใหม่" แบบแก้ว
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";
import { useGlass } from "./glass";

type Props = {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ErrorState({ message, retryLabel, onRetry, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const glass = useGlass();
  return (
    <View testID={testID} accessibilityRole="alert" style={[{ alignItems: "center", gap: tokens.spacing.rowGap }, style]}>
      <TeamText style={[tokens.type.heroBody, { color: colors.textSub, textAlign: "center" }]}>{message}</TeamText>
      <Pressable
        testID={testID ? `${testID}-retry` : undefined}
        onPress={onRetry}
        accessibilityRole="button"
        style={[glass, { minHeight: tokens.size.touchMin, borderRadius: tokens.radii.button, paddingHorizontal: tokens.spacing.pageX, alignItems: "center", justifyContent: "center" }]}
      >
        <TeamText style={[tokens.type.button, { color: colors.text }]} numberOfLines={1}>
          {retryLabel}
        </TeamText>
      </Pressable>
    </View>
  );
}
