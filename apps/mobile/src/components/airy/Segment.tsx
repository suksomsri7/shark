// ตัวเลือกแบบแบ่งช่อง .segw — รางจาง · ช่องที่เลือก = พื้นยกขึ้น
// CAL2.2: size="sm" = ขนาด .seg ของแบบปฏิทิน (cal-*.png: ราง padding 3 มน 12 · ช่อง 6/13px มน 9)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { shadow, useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

export function Segment({ options, value, onChange, testID, size = "md" }: { options: { key: string; label: string }[]; value: string; onChange?: (key: string) => void; testID: string; size?: "md" | "sm" }) {
  const sm = size === "sm";
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.track, sm && styles.trackSm, { backgroundColor: c.seg.track }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            testID={`${testID}-${o.key}`}
            key={o.key}
            onPress={() => onChange?.(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.opt, sm && styles.optSm, on && [{ backgroundColor: c.seg.on }, shadow(c.seg.onShadow)]]}
          >
            <Text style={[styles.t, sm && styles.tSm, { color: on ? c.seg.onFg : c.seg.fg }, on && styles.on]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radii.seg, padding: 4 },
  opt: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radii.segIn },
  t: { fontSize: 14 },
  on: { fontWeight: "600" },
  trackSm: { borderRadius: 12, padding: 3 },
  optSm: { paddingVertical: 7, borderRadius: 9 },
  tSm: { fontSize: 13 },
});
