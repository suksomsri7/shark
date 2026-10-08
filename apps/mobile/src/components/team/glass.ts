// สไตล์ "แก้ว" ร่วมของคอมโพเนนต์ทีม AI — fill + ขอบ + เงา จากธีม (JS ล้วน ไม่มี blur · คำตัดสินผู้คุมงาน T0.3)
import type { ViewStyle } from "react-native";
import { useTheme } from "@/src/theme";

export function useGlass(): ViewStyle {
  const { colors, tokens } = useTheme();
  return {
    backgroundColor: colors.glass.fill,
    borderColor: colors.glass.border,
    borderWidth: tokens.border.glass,
    boxShadow: colors.glass.shadow,
  };
}
