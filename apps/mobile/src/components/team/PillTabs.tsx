// แท็บเม็ดยา (ทั้งหมด / รออนุมัติ / กำลังทำ …) — อันที่เลือก = สีเข้มทึบ · ที่เหลือ = แก้ว · count = ตัวเลขสีเหลืองอำพันท้ายชื่อ
import { Pressable, ScrollView, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";
import { useGlass } from "./glass";

export type PillTab = { key: string; label: string; count?: number };

type Props = {
  tabs: PillTab[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function PillTabs({ tabs, value, onChange, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const glass = useGlass();
  // เม็ดสูง ~30 pt ตามภาพ → ขยายเป้าแตะแนวตั้งให้ถึง 44 pt
  const slop = Math.max(0, (tokens.size.touchMin - (tokens.type.tab.lineHeight + tokens.spacing.pillPadV * 2)) / 2);
  return (
    <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={{ gap: tokens.spacing.pillGap, paddingVertical: slop }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            testID={testID ? `${testID}-${t.key}` : undefined}
            onPress={() => onChange(t.key)}
            hitSlop={{ top: slop, bottom: slop }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              { flexDirection: "row", alignItems: "center", borderRadius: tokens.radii.pill, paddingVertical: tokens.spacing.pillPadV, paddingHorizontal: tokens.spacing.pillPadH },
              on ? { backgroundColor: colors.accent, borderWidth: tokens.border.glass, borderColor: colors.accent, boxShadow: colors.pillShadow } : glass,
            ]}
          >
            <TeamText style={[tokens.type.tab, { color: on ? colors.accentFg : colors.tabText }, on && { fontWeight: "600" }]} numberOfLines={1}>
              {t.label}
            </TeamText>
            {t.count ? (
              <TeamText style={[tokens.type.tab, { color: colors.count, fontWeight: "600", marginLeft: tokens.spacing.subTop }]} numberOfLines={1}>
                {String(t.count)}
              </TeamText>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
