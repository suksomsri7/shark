// แถวรายการแก้ว (พนักงาน · ตำแหน่งแนะนำ · เมนู) — ซ้าย: ลูกแก้ว/ไอคอน · กลาง: ชื่อ + บรรทัดรอง · ขวา: ของที่ส่งมา หรือลูกศร (chevron)
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";
import { GlassCard } from "./GlassCard";

type Props = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
  highlighted?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ListRow({ title, subtitle, left, right, chevron, highlighted, onPress, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  return (
    <GlassCard testID={testID} highlighted={highlighted} onPress={onPress} accessibilityLabel={title} style={[{ flexDirection: "row", alignItems: "center", gap: tokens.spacing.rowGap }, style]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <TeamText style={[tokens.type.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </TeamText>
        {subtitle ? (
          <TeamText style={[tokens.type.rowSub, { color: colors.textSub, marginTop: tokens.spacing.subTop }]} numberOfLines={1}>
            {subtitle}
          </TeamText>
        ) : null}
      </View>
      {right}
      {chevron ? <Feather name="chevron-right" size={tokens.size.chevron} color={colors.icon} /> : null}
    </GlassCard>
  );
}
