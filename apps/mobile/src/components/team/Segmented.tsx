// ตัวเลือกแบบแบ่งช่อง (ทุกวัน / ทุกสัปดาห์ / ทุกเดือน) — ช่องที่เลือกยกขึ้นเป็นแผ่นสว่าง
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";

export type SegmentOption = { key: string; label: string };

type Props = {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Segmented({ options, value, onChange, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const slop = Math.max(0, (tokens.size.touchMin - (tokens.type.segment.lineHeight + tokens.spacing.segItemPadV * 2)) / 2);
  return (
    <View testID={testID} style={[{ flexDirection: "row", backgroundColor: colors.segBg, borderRadius: tokens.radii.segmented, padding: tokens.spacing.segPad }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={testID ? `${testID}-${o.key}` : undefined}
            onPress={() => onChange(o.key)}
            hitSlop={{ top: slop, bottom: slop }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[
              { flex: 1, alignItems: "center", paddingVertical: tokens.spacing.segItemPadV, borderRadius: tokens.radii.segmentedItem },
              on && { backgroundColor: colors.segOn, boxShadow: colors.segShadow },
            ]}
          >
            <TeamText style={[tokens.type.segment, { color: on ? colors.segOnText : colors.textSub }, on && { fontWeight: "600" }]} numberOfLines={1}>
              {o.label}
            </TeamText>
          </Pressable>
        );
      })}
    </View>
  );
}
