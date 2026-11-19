// พื้นการ์ดของจอปฏิทิน (CAL2.x): สว่าง = ขาวทึบ + เงาบาง (แบบ .cal-ev/.grp/.brief `background:#fff`) · มืด = กระจกแบบเดียวกับการ์ดอื่นของแอป (แบบมืดแทน #fff ด้วย GLASS)
import type { ViewStyle } from "react-native";
import { glassStyle, shadow, type Palette } from "@/src/theme/index";

export function calCard(c: Palette, radius: number): ViewStyle {
  if (c.isDark) return glassStyle(c, radius);
  return { borderRadius: radius, backgroundColor: c.surface, ...shadow(c.glass.shadow) };
}
