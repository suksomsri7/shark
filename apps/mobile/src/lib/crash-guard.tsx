// ตัวกันแอปหลุด + จอแสดงข้อผิดพลาด (17 พ.ย. · build 28 หลุดตอนเข้าแชทลูกค้า — รายงานของ Apple ไม่มีข้อความ error ฝั่ง JS)
//   installCrashGuard(): ดัก error ร้ายแรงของ JS (ErrorUtils) ⇒ ไม่ปล่อยให้แอปปิด · เก็บข้อความ + stack ไว้แสดงบนจอ
//   <CrashOverlay/>     : แผ่นทับทั้งจอเมื่อมี error ที่ดักได้ — ข้อความเลือก/ถ่ายภาพหน้าจอส่งทีมได้ · ปุ่ม "ปิด" = ใช้งานต่อ
//   <CrashScreen/>      : จอของ ErrorBoundary (expo-router · app/_layout.tsx) — error ตอนวาดจอ · ปุ่ม "ลองใหม่"
// ใช้ Text/View ของ react-native ตรง ๆ (ไม่พึ่งธีม/ฟอนต์/ชุดคอมโพเนนต์ของแอป — จอนี้ต้องวาดได้แม้ส่วนอื่นพัง) · ข้อความไทยฝังในไฟล์โดยตั้งใจ
import { useSyncExternalStore } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Caught = { message: string; stack: string; fatal: boolean; at: string };

let last: Caught | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

function toCaught(e: unknown, fatal: boolean): Caught {
  const err = e as { message?: unknown; stack?: unknown } | null;
  return {
    message: String(err?.message ?? e ?? "unknown error").slice(0, 600),
    stack: String(err?.stack ?? "").slice(0, 2400),
    fatal,
    at: new Date().toISOString(),
  };
}

type RNErrorUtils = { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };

let installed = false;
/** เรียกครั้งเดียวตอนเปิดแอป (เว็บไม่มี ErrorUtils = ไม่ทำอะไร) */
export function installCrashGuard(): void {
  if (installed || Platform.OS === "web") return;
  const EU = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (!EU) return;
  installed = true;
  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((e, fatal) => {
    if (fatal) {
      // ร้ายแรง = เดิมแอปปิดทันที ⇒ เก็บไว้แสดงบนจอแทน (ไม่ส่งต่อ handler เดิม)
      last = toCaught(e, true);
      emit();
      return;
    }
    prev?.(e, false);
  });
}

function Body({ c, onClose, closeLabel }: { c: Caught; onClose: () => void; closeLabel: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.h}>แอปเจอข้อผิดพลาด</Text>
      <Text style={styles.sub}>ถ่ายภาพหน้าจอนี้ส่งให้ทีมงานได้เลย แล้วกด “{closeLabel}”</Text>
      <ScrollView style={styles.box} contentContainerStyle={styles.boxIn}>
        <Text selectable style={styles.msg}>
          {c.message}
        </Text>
        <Text selectable style={styles.stack}>
          {c.stack}
        </Text>
        <Text style={styles.meta}>{c.at}</Text>
      </ScrollView>
      <Pressable testID="crash-close" accessibilityRole="button" onPress={onClose} style={styles.btn}>
        <Text style={styles.btnT}>{closeLabel}</Text>
      </Pressable>
    </View>
  );
}

/** แผ่นทับทั้งจอของ error ที่ ErrorUtils ดักได้ — วางท้ายสุดของ root layout */
export function CrashOverlay() {
  const c = useSyncExternalStore(
    subscribe,
    () => last,
    () => null,
  );
  if (!c) return null;
  return (
    <View testID="crash-overlay" style={StyleSheet.absoluteFill}>
      <Body
        c={c}
        closeLabel="ปิด"
        onClose={() => {
          last = null;
          emit();
        }}
      />
    </View>
  );
}

/** จอของ ErrorBoundary (error ตอนวาดจอ) */
export function CrashScreen({ error, retry }: { error: Error; retry: () => void | Promise<void> }) {
  return <Body c={toCaught(error, false)} closeLabel="ลองใหม่" onClose={() => void retry()} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF", paddingTop: 64, paddingHorizontal: 20, paddingBottom: 34 },
  h: { fontSize: 20, fontWeight: "700", color: "#1B1B22" },
  sub: { fontSize: 14, lineHeight: 21, color: "#5E5E6A", marginTop: 6 },
  box: { flex: 1, marginTop: 14, borderRadius: 14, backgroundColor: "#F3F3F6" },
  boxIn: { padding: 14 },
  msg: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#B4232A" },
  stack: { fontSize: 11, lineHeight: 16, color: "#3A3A44", marginTop: 10 },
  meta: { fontSize: 11, color: "#8A8A96", marginTop: 10 },
  btn: { marginTop: 14, height: 50, borderRadius: 25, backgroundColor: "#1B1B22", alignItems: "center", justifyContent: "center" },
  btnT: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
