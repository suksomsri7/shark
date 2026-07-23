// UI ร่วมของจอ auth/DNA/drawer — orb โลโก้ + ปุ่มหลัก + ลิงก์ + ข้อความ error inline
// ใช้ธีม C/R/S เท่านั้น (ห้าม hardcode สี) · ปุ่มยิง API ต้องมี loading เสมอ
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text } from "react-native";
import { C, R, S } from "@/src/theme";

const ORB = require("../../../assets/orb.png");

// วง orb โลโก้ (นิ่ง) — วงแหวนน้ำเงินเรืองแสงแบบเว็บ (glow อยู่ในตัว png)
export function Orb({ size = 84 }: { size?: number }) {
  return <Image source={ORB} style={{ width: size, height: size }} resizeMode="contain" />;
}

// orb หมุน — ใช้ตอน "กำลังประกอบระบบ..."
export function SpinningOrb({ size = 84 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.Image
      source={ORB}
      style={{ width: size, height: size, transform: [{ rotate }] }}
      resizeMode="contain"
    />
  );
}

// ปุ่มหลักสีน้ำเงิน + loading
export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.btn, off && styles.btnOff, pressed && !off && styles.btnPressed]}
    >
      {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.btnText}>{label}</Text>}
    </Pressable>
  );
}

// ปุ่มลิงก์ (ข้อความ) — ส่งรหัสอีกครั้ง / ย้อนกลับ ฯลฯ
export function LinkButton({
  label,
  onPress,
  disabled = false,
  tone = "blue",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "blue" | "dim";
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={styles.link}>
      <Text
        style={[
          styles.linkText,
          { color: tone === "dim" ? C.textDim : C.blueHi },
          disabled && styles.linkOff,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ข้อความผิดพลาดใต้ช่อง (ห้าม Alert.alert — กติกา UX เจ้าของ)
export function InlineError({ text }: { text: string | null }) {
  if (!text) return null;
  return <Text style={styles.err}>{text}</Text>;
}

// สไตล์ช่องกรอกร่วม (ใช้ผ่าน spread ในแต่ละจอ)
export const inputStyle = {
  backgroundColor: C.surfaceHi,
  borderWidth: 1,
  borderColor: C.border,
  borderRadius: R.md,
  paddingHorizontal: S.lg,
  height: 54,
  color: C.text,
  fontSize: 16,
} as const;

export const inputPlaceholder = C.textFaint;

const styles = StyleSheet.create({
  btn: {
    backgroundColor: C.blue,
    borderRadius: R.md,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.lg,
  },
  btnOff: { opacity: 0.45 },
  btnPressed: { backgroundColor: C.blueSoft },
  btnText: { color: "#ffffff", fontSize: 16, fontFamily: "IBMPlexSansThai_700Bold" },
  link: { alignItems: "center", paddingVertical: S.sm },
  linkText: { fontSize: 14, fontWeight: "600" },
  linkOff: { opacity: 0.4 },
  err: { color: C.danger, fontSize: 13, marginTop: S.xs },
});
