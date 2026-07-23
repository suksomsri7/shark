// Text/TextInput กลางของแอป — ฝังฟอนต์ IBM Plex Sans Thai ตรง ๆ ทุกตัว (ห้าม import Text จาก react-native ในจอ)
// เหตุ: กลไก global (defaultProps/render patch) ใช้ไม่ได้บน RN 0.86/React 19 — เจ้าของเจอฟอนต์ผิด 2 รอบ
// map fontWeight → หน้าฟอนต์จริง (iOS ไม่สังเคราะห์น้ำหนักให้ฟอนต์ custom) แล้วล้าง fontWeight ทิ้ง
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from "react-native";

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

export function Text({ style, ...p }: TextProps) {
  return <RNText {...p} style={[style, fontStyle(style)]} />;
}

export function TextInput({ style, ...p }: TextInputProps) {
  return <RNTextInput {...p} style={[style, fontStyle(style as TextProps["style"])]} />;
}
