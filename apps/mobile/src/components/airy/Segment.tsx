// ตัวเลือกแบบแบ่งช่อง .segw — รางจาง · ช่องที่เลือก = พื้นยกขึ้น
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { shadow, useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

export function Segment({ options, value, onChange, testID }: { options: { key: string; label: string }[]; value: string; onChange?: (key: string) => void; testID: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.track, { backgroundColor: c.seg.track }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            testID={`${testID}-${o.key}`}
            key={o.key}
            onPress={() => onChange?.(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.opt, on && [{ backgroundColor: c.seg.on }, shadow(c.seg.onShadow)]]}
          >
            <Text style={[styles.t, { color: on ? c.seg.onFg : c.seg.fg }, on && styles.on]}>{o.label}</Text>
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
});
