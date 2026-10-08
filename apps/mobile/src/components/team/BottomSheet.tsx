// แผ่นล่าง — View absolute + ฉากหลังมืด (ไม่ใช้ Modal ของ RN: เว็บ headless ไม่วาด) · เต็มกรอบของ parent ที่ครอบ · แตะฉากหลัง = onClose
import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function BottomSheet({ visible, onClose, children, closeLabel, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  if (!visible) return null;
  const fill: ViewStyle = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 };
  return (
    <View testID={testID} style={[fill, { justifyContent: "flex-end", zIndex: 50 }]}>
      <Pressable
        testID={testID ? `${testID}-backdrop` : undefined}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        style={[fill, { minHeight: tokens.size.touchMin, backgroundColor: colors.scrim }]}
      />
      <View
        style={[
          {
            marginHorizontal: tokens.spacing.sheetInset,
            marginBottom: tokens.spacing.sheetInset,
            borderRadius: tokens.radii.sheet,
            paddingVertical: tokens.spacing.sheetPadV,
            paddingHorizontal: tokens.spacing.sheetPadH,
            backgroundColor: colors.sheet,
            boxShadow: colors.glass.shadow,
          },
          style,
        ]}
      >
        <View style={{ alignSelf: "center", width: tokens.size.grabW, height: tokens.size.grabH, borderRadius: tokens.radii.grab, backgroundColor: colors.grab, marginBottom: tokens.spacing.grabBottom }} />
        {children}
      </View>
    </View>
  );
}
