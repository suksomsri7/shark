// พื้นหลังจอ Airy — สีพื้น + ก้อนสีฟุ้ง 4 ก้อน (เขียวขวาบน · ชมพูซ้าย · ฟ้าขวา · ส้มซ้ายล่าง) ตาม `.screen` ของ mockup
// mockup ใช้ไล่สีวงกลม 4 ชั้น — ที่นี่ใช้เงาฟุ้ง (boxShadow blur + spread) ของจุดเล็ก ๆ แทน: JS ล้วน ได้ทั้งเครื่องจริงและเว็บ
// ตำแหน่ง/รัศมี = ค่าของ CSS × 390/536 (รัศมีที่สีจางหมด = 70% ของรัศมีไล่สี)
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/theme";

type Props = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// [ซ้าย %, บน %, รัศมีที่จางหมด pt] — gen_glass_airy.py:88 (420×380 @90% 8% · 500×500 @0% 35% · 500×420 @100% 70% · 400×400 @20% 100%)
const BLOBS: { key: "a" | "b" | "c" | "d"; left: number; top: number; reach: number }[] = [
  { key: "a", left: 90, top: 8, reach: 204 },
  { key: "b", left: 0, top: 35, reach: 255 },
  { key: "c", left: 100, top: 70, reach: 234 },
  { key: "d", left: 20, top: 100, reach: 204 },
];

export function Backdrop({ style, testID }: Props) {
  const { colors, tokens } = useTheme();
  return (
    <View testID={testID} pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden", backgroundColor: colors.bg }, style]}>
      {BLOBS.map((b) => (
        <View
          key={b.key}
          style={{
            position: "absolute",
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: 2,
            height: 2,
            marginLeft: -1,
            marginTop: -1,
            borderRadius: tokens.radii.full,
            backgroundColor: colors.blob[b.key],
            boxShadow: `0px 0px ${b.reach / 2}px ${b.reach / 2}px ${colors.blob[b.key]}`,
          }}
        />
      ))}
    </View>
  );
}
