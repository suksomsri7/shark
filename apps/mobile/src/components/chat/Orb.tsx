// Orb วงแหวนน้ำเงินเรืองแสงแบบเว็บ (รูปจริง orb.png — glow อยู่ในตัว) — ใช้ใน empty state
import { Image } from "react-native";

const ORB = require("../../../assets/orb.png");

export function Orb({ size = 72 }: { size?: number }) {
  return <Image source={ORB} style={{ width: size, height: size }} resizeMode="contain" />;
}
