// วงแหวนโควตา (% ที่ใช้ไป) — สร้างจาก View ล้วน (ไม่มี SVG · คำตัดสิน OQ-2): วงราง + ครึ่งวงสองซีกที่หมุนตามเปอร์เซ็นต์
// ผู้ใช้เห็นแค่ % กับป้าย — ไม่มีโทเคน/เงิน (คำตัดสิน R-A8)
import { View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";

type Props = {
  pct: number;
  label: string;
  size?: number;
  tone?: "default" | "warn" | "danger";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function QuotaRing({ pct, label, size, tone = "default", style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const d = size ?? tokens.size.ring;
  const stroke = tokens.size.ringStroke;
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const ink = tone === "danger" ? colors.danger : tone === "warn" ? colors.warn : colors.ring;
  const first = Math.min(p, 50) * 3.6; // ซีกขวา 0–180°
  const second = Math.max(p - 50, 0) * 3.6; // ซีกซ้าย 0–180°
  const circle: ViewStyle = { width: d, height: d, borderRadius: tokens.radii.full, borderWidth: stroke };
  const half: ViewStyle = { position: "absolute", top: 0, width: d / 2, height: d, overflow: "hidden" };
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }} style={[{ width: d, height: d, alignItems: "center", justifyContent: "center" }, style]}>
      <View style={[circle, { position: "absolute", left: 0, top: 0, borderColor: colors.track }]} />
      {/* ซีกขวา: ครึ่งวงซ้ายหมุนเข้ามาในช่องขวา */}
      <View style={[half, { left: d / 2 }]}>
        <View style={{ position: "absolute", left: -d / 2, top: 0, width: d, height: d, transform: [{ rotate: `${first}deg` }] }}>
          <View style={{ width: d / 2, height: d, overflow: "hidden" }}>
            <View style={[circle, { borderColor: ink }]} />
          </View>
        </View>
      </View>
      {/* ซีกซ้าย: ครึ่งวงขวาหมุนเข้ามาในช่องซ้าย (เริ่มเมื่อเกิน 50%) */}
      <View style={[half, { left: 0 }]}>
        <View style={{ position: "absolute", left: 0, top: 0, width: d, height: d, transform: [{ rotate: `${second}deg` }] }}>
          <View style={{ position: "absolute", left: d / 2, top: 0, width: d / 2, height: d, overflow: "hidden" }}>
            <View style={[circle, { position: "absolute", left: -d / 2, top: 0, borderColor: second > 0 ? ink : colors.glass.border, opacity: second > 0 ? 1 : 0 }]} />
          </View>
        </View>
      </View>
      <TeamText style={[tokens.type.statValue, { color: colors.text }]} numberOfLines={1}>{`${Math.round(p)}%`}</TeamText>
      <TeamText style={[tokens.type.statLabel, { color: colors.textDim }]} numberOfLines={1}>
        {label}
      </TeamText>
    </View>
  );
}
