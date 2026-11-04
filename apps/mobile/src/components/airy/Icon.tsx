// ไอคอนเส้นของธีม Airy — ใช้ชุด Feather ของ @expo/vector-icons (มากับ Expo อยู่แล้ว · ไม่มี react-native-svg ในแอป)
// เส้นบาง หัวมน ใกล้กับ svg ในแบบ (stroke 1.8 round) · สีปริยาย = c.icon ของธีม
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { useTheme } from "@/src/theme/index";
import { size as SZ } from "@/src/theme/tokens";

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({ name, size = SZ.icon, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Feather name={name} size={size} color={color ?? c.icon} />;
}
