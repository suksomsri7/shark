// bubble "กำลังคิด…" — จุด 3 จุดกระพริบ (label เปลี่ยนได้จาก event status)
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { C, R, S } from "@/src/theme";

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return <Animated.View style={[styles.dot, { opacity: v }]} />;
}

export function TypingIndicator({ label }: { label: string }) {
  return (
    <View style={styles.bubble}>
      <View style={styles.dots}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderBottomLeftRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    marginRight: 40,
  },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.blueHi },
  label: { color: C.textDim, fontSize: 13 },
});
