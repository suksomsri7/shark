// ข้อความของจอทีมพนักงาน AI — ละติน/ตัวเลข/วรรคตอน = Inter · อักษรไทย = IBM Plex Sans Thai (ตาม font-family ของ mockup)
// สร้างบน ui/text.tsx: ตัวนอกถือฟอนต์ Inter · ช่วงอักษรไทยเป็น span ซ้อนที่ถือ IBM Plex Sans Thai น้ำหนักเดียวกัน
// children ที่เป็นสตริง/ตัวเลขถูกแบ่งช่วง · ที่เป็น element (เช่น TeamText ซ้อน สีอื่น/น้ำหนักอื่น) ส่งผ่านตามเดิม
import { Children, type ReactNode } from "react";
import { Platform, StyleSheet, type TextProps, type TextStyle } from "react-native";
import { Text } from "@/src/components/ui/text";
import { fontFor, splitRuns } from "./text-runs";

export { splitRuns, fontFor } from "./text-runs";
export type { TeamTextRun, TeamTextScript } from "./text-runs";

/** ฟอนต์ของช่องพิมพ์ (แบ่งช่วงในช่องพิมพ์ไม่ได้): เว็บ = กองฟอนต์เหมือน mockup · เครื่องจริง = IBM Plex Sans Thai (มีทั้งไทยและละติน) */
export function teamInputFontFamily(weight?: string | number | null): string {
  const thai = fontFor("thai", weight);
  return Platform.OS === "web" ? [fontFor("latin", weight), thai].join(", ") : thai;
}

export function TeamText({ style, children, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const weight = flat.fontWeight;
  const thai: TextStyle = { fontFamily: fontFor("thai", weight) };
  let n = 0;
  const parts: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (typeof child !== "string" && typeof child !== "number") {
      parts.push(child);
      return;
    }
    for (const run of splitRuns(String(child))) {
      if (run.script === "thai") {
        parts.push(
          <Text key={`t${n++}`} style={thai}>
            {run.text}
          </Text>,
        );
      } else parts.push(run.text);
    }
  });
  return (
    <Text {...rest} style={[style, { fontFamily: fontFor("latin", weight) }]}>
      {parts}
    </Text>
  );
}
