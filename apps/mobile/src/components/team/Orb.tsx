// ลูกแก้วของพนักงาน AI — ภาพ PNG ที่เรนเดอร์จาก CSS ของ mockup (scripts/ai-team-render-orbs.mjs · คำตัดสิน OQ-3) + ตัวอักษรย่อ (ถ้าส่งมา)
// เงานอกมาจากธีม (ภาพมีแค่ตัวลูก + เงาใน + ขอบ) · status = จุดสถานะมุมขวาล่าง
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";

export type OrbDepartment = "sales" | "chat" | "account" | "content" | "member" | "custom";
export type OrbStatus = "ok" | "warn" | "idle";

const SOURCES: Record<"light" | "dark", Record<OrbDepartment, ImageSourcePropType>> = {
  light: {
    sales: require("../../../assets/team/orbs/sales-light.png"),
    chat: require("../../../assets/team/orbs/chat-light.png"),
    account: require("../../../assets/team/orbs/account-light.png"),
    content: require("../../../assets/team/orbs/content-light.png"),
    member: require("../../../assets/team/orbs/member-light.png"),
    custom: require("../../../assets/team/orbs/custom-light.png"),
  },
  dark: {
    sales: require("../../../assets/team/orbs/sales-dark.png"),
    chat: require("../../../assets/team/orbs/chat-dark.png"),
    account: require("../../../assets/team/orbs/account-dark.png"),
    content: require("../../../assets/team/orbs/content-dark.png"),
    member: require("../../../assets/team/orbs/member-dark.png"),
    custom: require("../../../assets/team/orbs/custom-dark.png"),
  },
};

type Props = {
  department: OrbDepartment;
  size: number;
  initial?: string;
  status?: OrbStatus;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Orb({ department, size, initial, status, accessibilityLabel, style, testID }: Props) {
  const { mode, colors, tokens } = useTheme();
  const dot = tokens.size.statusDot;
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size, borderRadius: tokens.radii.full, boxShadow: colors.orbShadow, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Image source={SOURCES[mode][department] ?? SOURCES[mode].custom} style={{ position: "absolute", left: 0, top: 0, width: size, height: size }} resizeMode="contain" />
      {initial ? (
        <TeamText style={{ color: colors.orbInitial, fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: "600" }} numberOfLines={1}>
          {initial}
        </TeamText>
      ) : null}
      {status ? (
        <View
          style={{
            position: "absolute",
            right: -1.5,
            bottom: 0,
            width: dot,
            height: dot,
            borderRadius: tokens.radii.full,
            borderWidth: tokens.border.dot,
            borderColor: colors.avatarRing,
            backgroundColor: status === "ok" ? colors.ok : status === "warn" ? colors.warn : colors.idle,
          }}
        />
      ) : null}
    </View>
  );
}
