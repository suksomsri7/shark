// Text/TextInput กลางของแอป — ฝังฟอนต์ IBM Plex Sans Thai ตรง ๆ ทุกตัว (ห้าม import Text จาก react-native ในจอ)
// เหตุ: กลไก global (defaultProps/render patch) ใช้ไม่ได้บน RN 0.86/React 19 — เจ้าของเจอฟอนต์ผิด 2 รอบ
// map fontWeight → หน้าฟอนต์จริง (iOS ไม่สังเคราะห์น้ำหนักให้ฟอนต์ custom) แล้วล้าง fontWeight ทิ้ง
// R-S2.13i: แอปตั้ง userInterfaceStyle "automatic" แล้ว ⇒ Text/TextInput ที่ไม่ระบุสี ใช้สีตัวอักษรของธีมสว่าง 1.0 (C.text) เสมอ
//   ไม่ให้ตัวอักษรของจอ 1.0 เปลี่ยนตามโหมดมืดของเครื่อง (Android ใช้สีตามธีมระบบเป็นค่าตั้งต้น) · จอเลขาส่งสีจาก useTheme เองทุกตัว (สีที่ส่งมาชนะ)
//   Text ซ้อนใน Text = ไม่ใส่สีตั้งต้น (ให้รับสีจากตัวแม่ตามเดิม) — รู้ด้วย context ของตัวห่อนี้
import { createContext, useContext } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { C } from "@/src/theme";

function family(w?: TextStyle["fontWeight"]): string {
  const s = String(w ?? "400");
  const n = s === "bold" ? 700 : s === "normal" ? 400 : Number(s) || 400;
  if (n >= 700) return "IBMPlexSansThai_700Bold";
  if (n >= 600) return "IBMPlexSansThai_600SemiBold";
  if (n >= 500) return "IBMPlexSansThai_500Medium";
  return "IBMPlexSansThai_400Regular";
}

function fontStyle(style: TextProps["style"]): TextStyle {
  const f = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  return { fontFamily: f.fontFamily ?? family(f.fontWeight), fontWeight: "normal" };
}

/** อยู่ใน Text ของตัวห่อนี้แล้ว (Text ซ้อน) */
const InText = createContext(false);
const BASE: TextStyle = { color: C.text };

export function Text({ style, children, ...p }: TextProps) {
  const nested = useContext(InText);
  return (
    <RNText {...p} style={[nested ? null : BASE, style, fontStyle(style)]}>
      <InText.Provider value={true}>{children}</InText.Provider>
    </RNText>
  );
}

export function TextInput({ style, ...p }: TextInputProps) {
  return <RNTextInput {...p} style={[BASE, style, fontStyle(style as TextProps["style"])]} />;
}
