// โควตางาน (แบบ B8 sec-b.jpg หน้า 8) — ตัวเลข % ใหญ่ + แถบไล่สี (ไม่มี react-native-svg ⇒ "วง" = แถบตามแบบ)
//   ทุก % ถูกตัดที่ 0..100 ก่อนวาด (RESOLUTIONS R-S1.13i · B8 cap) · ไม่มีตัวเงินในคอมโพเนนต์นี้
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { bgImage, linear, useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function QuotaBar({ pct, testID, thin = false }: { pct: number; testID?: string; thin?: boolean }) {
  const { c } = useTheme();
  const p = clamp(pct);
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }} style={[styles.track, thin && styles.thin, { backgroundColor: c.btnOff.bg }]}>
      <View style={[styles.fill, { width: `${p}%` }, bgImage(linear(c.orb.c2, c.sys.dorm, 90)), { backgroundColor: c.orb.c1 }]} />
    </View>
  );
}

export function QuotaRing({ pct, testID, caption }: { pct: number; testID: string; caption?: string }) {
  const { c } = useTheme();
  const p = clamp(pct);
  return (
    <View testID={testID}>
      <Text style={[styles.big, { color: c.text }]}>
        {p}
        <Text style={[styles.unit, { color: c.text }]}>%</Text>
      </Text>
      {caption ? <Text style={[styles.cap, { color: c.textDim }]}>{caption}</Text> : null}
      <View style={styles.barGap}>
        <QuotaBar pct={p} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 76, fontWeight: "600", letterSpacing: -3, lineHeight: 84 },
  unit: { fontSize: 64, fontWeight: "500", letterSpacing: -2 },
  cap: { fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  barGap: { marginTop: 14 },
  track: { height: 6, borderRadius: radii.round, overflow: "hidden" },
  thin: { height: 5 },
  fill: { height: "100%", borderRadius: radii.round },
});
