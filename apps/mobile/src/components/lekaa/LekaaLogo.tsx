// โลโก้ Lekaa แบบนิ่ง (ตัว L ไล่สี) — เส้นทาง/สีเดียวกับ assets/brand/logo.svg และ LekaaLoader (LEKAA_PATH)
//   ใช้ในปุ่มลอย Lekaa + หัวแผ่น Lekaa (แบบ fab6) · เส้นหนา 22 ตามแบบ (ตัวเล็ก ~30px ต้องหนากว่าโลโก้ใหญ่)
import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { LEKAA_PATH } from "@/src/components/brand/LekaaLoader";

const STOPS: [number, string][] = [
  [0, "#4FCDEE"],
  [0.3, "#5E8DEA"],
  [0.5, "#7C66EA"],
  [0.75, "#A644E2"],
  [1, "#DA33E6"],
];

export function LekaaLogo({ size = 30, stroke = 22 }: { size?: number; stroke?: number }) {
  const gid = `lk${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size} viewBox="-5 -3.5 270 270">
      <Defs>
        <LinearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" y1="13" x2="0" y2="250">
          {STOPS.map(([o, c]) => (
            <Stop key={o} offset={o} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Path d={LEKAA_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
