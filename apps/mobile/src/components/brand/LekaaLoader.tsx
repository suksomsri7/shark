// LekaaLoader — แอนิเมชันโหลดของโลโก้ Lekaa (เจ้าของสั่ง 15 พ.ย.: ตัวโหลดทุกจุดใช้โลโก้ใหม่แทนวงแหวน/วงหมุน)
// ต้นฉบับ: assets/brand/loading-A.svg (CSS) · ภาพอ้างอิง loading-A.gif — ทำซ้ำด้วย react-native-svg + reanimated:
//   เส้นทางตัว L (viewBox -5 -3.5 270 270) · ไล่สีแนวตั้ง #4FCDEE→#5E8DEA→#7C66EA→#A644E2→#DA33E6 (userSpaceOnUse y 13→250)
//   ราง: กว้าง 12 · ทึบ .12 · หาง 24 ชั้น: ชั้น k ยาว k×0.01413 ของเส้น · กว้าง 3 + (24−k)×0.375 · ทึบ .13 · หัว: จุดกลม กว้าง 12 ทึบ 1
//   ทุกชั้นวิ่งรอบ 1.6 วิ เชิงเส้น (strokeDashoffset จาก a·L ไป −(1−a)·L) — pathLength="1" ของต้นฉบับ แปลงเป็นความยาวจริง L (react-native-svg ไม่รองรับ pathLength ทุกแพลตฟอร์ม)
//   เรืองแสงของหัว (feGaussianBlur 6 · กว้าง 20 · .55) = จุดกลมกว้าง 18–40 หกชั้นทึบน้อย ใต้หัว (ฟิลเตอร์ blur ไม่สม่ำเสมอข้ามแพลตฟอร์ม)
// `progress` (0..1) = วาดเฟรมนิ่ง (QC เทียบกับ gif) · ไม่ใส่ = วนเอง · ระบบตั้ง "ลดการเคลื่อนไหว" = เฟรมนิ่งที่หัวอยู่บนสุด
import { memo, useEffect, useId } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import Animated, { Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";

/** เส้นทางตัว L (เหมือน logo.svg ทุกตัวอักษร) */
export const LEKAA_PATH = "M30 45.5 A26.5 26.5 0 0 1 83 45.5 L83 216.5 A27 27 0 0 0 110 243.5 L203 243.5 A27 27 0 0 0 203 189.5 L60 189.5 A30 30 0 0 1 30 159.5 Z";
/** ความยาวจริงของเส้นทาง: ครึ่งวง r26.5 + 171 + ¼ วง r27 + 93 + ครึ่งวง r27 + 143 + ¼ วง r30 + 114 */
export const LEKAA_LEN = Math.PI * 26.5 + 171 + (Math.PI / 2) * 27 + 93 + Math.PI * 27 + 143 + (Math.PI / 2) * 30 + 114;
export const LEKAA_PERIOD_MS = 1600;
const VIEWBOX = "-5 -3.5 270 270";
const STOPS: [number, string][] = [
  [0, "#4FCDEE"],
  [0.3, "#5E8DEA"],
  [0.5, "#7C66EA"],
  [0.75, "#A644E2"],
  [1, "#DA33E6"],
];
/** ชั้นหาง (ต้นฉบับ .t1–.t24): ชั้นยาวสุด = บางสุด */
const TRAILS = Array.from({ length: 24 }, (_, i) => {
  const k = 24 - i; // วาด t24 ก่อน (ยาว/บาง) แล้วไล่ถึง t1 (สั้น/หนา) ตามลำดับในไฟล์
  return { k, frac: Number((k * 0.014129).toFixed(4)), width: 3 + (24 - k) * 0.375 };
});
/** เรืองแสงหัว (แทน feGaussianBlur stdDeviation 6 ของเส้นกว้าง 20 ทึบ .55) */
const GLOW = [
  { width: 40, opacity: 0.035 },
  { width: 35, opacity: 0.045 },
  { width: 30, opacity: 0.06 },
  { width: 26, opacity: 0.08 },
  { width: 22, opacity: 0.1 },
  { width: 18, opacity: 0.12 },
];
/** หัวจุดกลม: ต้นฉบับยาว .0001 — ใช้ .002 (≈1.5 หน่วย) ให้ทุกแพลตฟอร์มวาดจุดแม้อยู่ที่จุดเริ่มของเส้นปิด (เว็บไม่วาดขีดยาว ~0 ที่จุดต่อ Z) */
const HEAD = 0.002;

const APath = Animated.createAnimatedComponent(Path);

/** offset (หน่วยความยาวจริง) ของชั้นที่ยาว frac ณ เวลา p (0..1) — จาก a·L ไป −(1−a)·L */
export function dashOffset(frac: number, p: number): number {
  return frac * LEKAA_LEN - p * LEKAA_LEN;
}

const Layer = memo(function Layer({
  t,
  still,
  frac,
  width,
  opacity,
  cap,
  stroke,
}: {
  t: SharedValue<number>;
  still: number | null;
  frac: number;
  width: number;
  opacity: number;
  cap: "butt" | "round";
  stroke: string;
}) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: frac * LEKAA_LEN - t.value * LEKAA_LEN }));
  const dash = [Math.max(frac, 0.0001) * LEKAA_LEN, (1 - Math.max(frac, 0.0001)) * LEKAA_LEN];
  const common = { d: LEKAA_PATH, fill: "none", stroke, strokeWidth: width, strokeLinecap: cap, strokeLinejoin: "round" as const, opacity, strokeDasharray: dash };
  if (still !== null) return <Path {...common} strokeDashoffset={dashOffset(frac, still)} />;
  return <APath {...common} animatedProps={props} />;
});

export function LekaaLoader({
  size = 72,
  progress,
  style,
  testID = "lekaa-loader",
  label = "Loading",
}: {
  size?: number;
  /** 0..1 เฟรมนิ่ง (QC) */
  progress?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const still = typeof progress === "number" ? ((progress % 1) + 1) % 1 : reduce ? 0 : null;
  const t = useSharedValue(still ?? 0);
  useEffect(() => {
    if (still !== null) {
      t.value = still;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: LEKAA_PERIOD_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);
  const gid = `lk${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  const stroke = `url(#${gid})`;
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityLabel={label} style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={VIEWBOX}>
        <Defs>
          <LinearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="13" x2="0" y2="250">
            {STOPS.map(([o, col]) => (
              <Stop key={o} offset={o} stopColor={col} />
            ))}
          </LinearGradient>
        </Defs>
        {/* ราง */}
        <Path d={LEKAA_PATH} fill="none" stroke={stroke} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" opacity={0.12} />
        {TRAILS.map((l) => (
          <Layer key={l.k} t={t} still={still} frac={l.frac} width={l.width} opacity={0.13} cap="butt" stroke={stroke} />
        ))}
        {/* หัว */}
        {GLOW.map((g) => (
          <Layer key={g.width} t={t} still={still} frac={HEAD} width={g.width} opacity={g.opacity} cap="round" stroke={stroke} />
        ))}
        <Layer t={t} still={still} frac={HEAD} width={12} opacity={1} cap="round" stroke={stroke} />
      </Svg>
    </View>
  );
}

/** โลโก้นิ่ง (logo.svg · เส้นเต็ม กว้าง 12) — ใช้ต่อจาก splash ของเครื่องตอนเปิดแอป */
export function LekaaLogo({ size = 72, style, testID }: { size?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const gid = `lg${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <View testID={testID} style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={VIEWBOX}>
        <Defs>
          <LinearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="13" x2="0" y2="250">
            {STOPS.map(([o, col]) => (
              <Stop key={o} offset={o} stopColor={col} />
            ))}
          </LinearGradient>
        </Defs>
        <Path d={LEKAA_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
