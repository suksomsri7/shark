// Orb วงแหวนน้ำเงิน (เวอร์ชัน RN ของ .ai-orb ฝั่งเว็บ) — ใช้ใน empty state
import { View, StyleSheet } from "react-native";
import { C } from "@/src/theme";

export function Orb({ size = 72 }: { size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.ring, { borderRadius: size / 2 }]} />
      <View style={[styles.core, { width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", backgroundColor: C.blueSoft },
  ring: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: C.blueHi },
  core: { backgroundColor: C.blueHi },
});
