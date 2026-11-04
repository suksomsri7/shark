// ลูกแก้วของเลขา (.ao.o1) — วงไล่สีจากธีม · ขนาดตาม prop
import { View } from "react-native";
import { orbStyle, useTheme } from "@/src/theme/index";
import { size as SZ } from "@/src/theme/tokens";

export function Orb({ size = SZ.orb, testID }: { size?: number; testID?: string }) {
  const { c } = useTheme();
  return <View testID={testID} style={orbStyle(c, size)} />;
}
