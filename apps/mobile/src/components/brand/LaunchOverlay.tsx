// จอเปิดแอป (เจ้าของสั่ง 15 พ.ย.: "เปิดแอปให้โชว์แอนิเมชันโลโก้ใหญ่")
//   splash ของเครื่อง = โลโก้นิ่ง Lekaa กว้าง SPLASH_LOGO (146 dp · app.json expo-splash-screen imageWidth) กลางจอ บนขาว (มืด = พื้นมืดของธีม)
//   ทับด้วยจอนี้ตำแหน่ง/ขนาดเดียวกัน แล้วซ่อน splash (ต่อเนื่องไม่กระพริบ) → โลโก้นิ่งค่อย ๆ จางเป็น LekaaLoader ขยายเป็น BIG (200) ·
//   อยู่จนกว่า ฟอนต์ + auth พร้อม และวิ่งครบอย่างน้อย 1 รอบ (1.6 วิ) → จางออก 350 ms แล้วถอดออก
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { LekaaLoader, LekaaLogo, LEKAA_PERIOD_MS } from "./LekaaLoader";
import { dark, light } from "@/src/theme/index";
import { useThemeMode } from "@/src/lib/theme-store";

/** ขนาด viewBox ของโลโก้บน splash (dp) — ต้องตรงกับ app.json → expo-splash-screen.imageWidth */
export const SPLASH_LOGO = 146;
export const BIG_LOADER = 200;
const FADE_OUT_MS = 350;

export function LaunchOverlay({ ready }: { ready: boolean }) {
  const sys = useColorScheme();
  const mode = useThemeMode();
  const isDark = mode === "dark" || (mode !== "light" && sys === "dark");
  const bg = isDark ? dark.bg.base : light.surface; // สว่าง = ขาว (#fff) เท่า splash ของเครื่อง
  const [gone, setGone] = useState(false);
  const [minDone, setMinDone] = useState(false);
  const started = useRef(Date.now());

  const grow = useSharedValue(0); // 0 = ขนาด/รูปแบบ splash · 1 = ตัวโหลดใหญ่
  const out = useSharedValue(1);

  const onLayout = () => {
    void SplashScreen.hideAsync().catch(() => {});
    grow.value = withDelay(120, withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }));
  };
  useEffect(() => {
    const id = setTimeout(() => setMinDone(true), LEKAA_PERIOD_MS + 450);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!ready || !minDone || gone) return;
    out.value = withTiming(0, { duration: FADE_OUT_MS }, (fin) => {
      if (fin) runOnJS(setGone)(true);
    });
  }, [ready, minDone, gone, out]);
  // กันค้าง: เกิน 12 วิ ถอดออกเอง (จอหลักจัดการโหลดของตัวเองต่อ)
  useEffect(() => {
    const id = setTimeout(() => setGone(true), Math.max(0, 12_000 - (Date.now() - started.current)));
    return () => clearTimeout(id);
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: out.value }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: 1 - grow.value }));
  const loaderStyle = useAnimatedStyle(() => ({
    opacity: grow.value,
    transform: [{ scale: SPLASH_LOGO / BIG_LOADER + (1 - SPLASH_LOGO / BIG_LOADER) * grow.value }],
  }));

  if (gone) return null;
  return (
    <Animated.View testID="launch-overlay" pointerEvents={ready && minDone ? "none" : "auto"} onLayout={onLayout} style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: bg }, rootStyle]}>
      <Animated.View style={[styles.abs, logoStyle]}>
        <LekaaLogo size={SPLASH_LOGO} testID="launch-logo" />
      </Animated.View>
      <Animated.View style={[styles.abs, loaderStyle]}>
        <LekaaLoader size={BIG_LOADER} testID="launch-loader" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", zIndex: 1000 },
  abs: { position: "absolute" },
});
