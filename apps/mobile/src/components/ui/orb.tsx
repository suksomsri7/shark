// orb แอนิเมชันกลาง — หมุนช้า (16s linear) + เต้นแบบหัวใจ (scale 1→1.07→1, 1600ms/ขา inOut)
// ใช้ native driver · รูป orb.png มี glow ในตัว (วงแหวนน้ำเงินเรืองแสงแบบเว็บ) → ไม่ต้องมีพื้น/เงา
// ใช้ที่จอ login (โลโก้) + ปุ่ม orb ลอยหน้า dashboard — logic กลาง ไม่ซ้ำ inline
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

const ORB = require("../../../assets/orb.png");

export function AnimatedOrb({ size = 84 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spinAnim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true }),
    );
    const breatheAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    spinAnim.start();
    breatheAnim.start();
    return () => {
      spinAnim.stop();
      breatheAnim.stop();
    };
  }, [spin, scale]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.Image
      source={ORB}
      style={{ width: size, height: size, transform: [{ rotate }, { scale }] }}
      resizeMode="contain"
    />
  );
}
