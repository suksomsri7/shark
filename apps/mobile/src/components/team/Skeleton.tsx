// แท่งโครงระหว่างโหลด — สีจากธีม · นิ่ง (ไม่กะพริบ: ภาพ QC ต้องซ้ำได้ทุกรอบ)
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/theme";

type Props = {
  height: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Skeleton({ height, width = "100%", radius, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  return <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: radius ?? tokens.radii.field, backgroundColor: colors.skeleton }, style]} />;
}
