// การ์ดกระจก .gl — พื้นไล่ + ขอบ 1.5 + เงา จากธีม · `pad` = ระยะในการ์ดมาตรฐาน (16/18) หรือกำหนดเอง
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { glassStyle, useTheme } from "@/src/theme/index";
import { cardPad, radii } from "@/src/theme/tokens";

type Pad = boolean | { v: number; h: number };

export function Glass({
  children,
  pad = true,
  radius = radii.card,
  style,
  testID,
}: {
  children?: ReactNode;
  pad?: Pad;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { c } = useTheme();
  const p = pad === true ? cardPad : pad === false ? null : pad;
  return (
    <View testID={testID} style={[glassStyle(c, radius), p && { paddingVertical: p.v, paddingHorizontal: p.h }, style]}>
      {children}
    </View>
  );
}
