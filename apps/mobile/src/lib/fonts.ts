// โหลดฟอนต์ไทย IBM Plex Sans Thai (ชุดเดียวกับเว็บ) — ใช้ครอบทั้งแอปใน _layout
// คืน true เมื่อโหลดเสร็จ (ระหว่างโหลดให้จอ root คง splash / return null)
import {
  useFonts,
  IBMPlexSansThai_400Regular,
  IBMPlexSansThai_500Medium,
  IBMPlexSansThai_600SemiBold,
  IBMPlexSansThai_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-thai";

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    IBMPlexSansThai_400Regular,
    IBMPlexSansThai_500Medium,
    IBMPlexSansThai_600SemiBold,
    IBMPlexSansThai_700Bold,
  });
  return loaded;
}

// บังคับฟอนต์ default ทั้งแอปแบบชัวร์: React 19 เลิกอ่าน defaultProps ของ function component แล้ว
// → patch ที่ render ของ forwardRef (Text/TextInput ใน RN เป็น forwardRef — .render คือฟังก์ชันข้างใน)
// ฟอนต์ base อยู่หน้าสุดของ style array → style ที่จอประกาศเอง (รวม fontFamily bold) ชนะเสมอ
import React from "react";
import { Text, TextInput } from "react-native";

let patched = false;
export function applyGlobalFont(): void {
  if (patched) return;
  patched = true;
  const base = { fontFamily: "IBMPlexSansThai_400Regular" };
  for (const comp of [Text, TextInput]) {
    const c = comp as unknown as { render?: (...a: unknown[]) => React.ReactElement };
    const orig = c.render;
    if (typeof orig !== "function") continue;
    c.render = function (this: unknown, ...args: unknown[]) {
      const el = orig.apply(this, args);
      const prev = (el.props as { style?: unknown }).style;
      return React.cloneElement(el, { style: [base, prev] } as Partial<unknown>);
    };
  }
}
