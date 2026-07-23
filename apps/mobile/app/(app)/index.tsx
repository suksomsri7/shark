// หน้าแรกหลัง login = dashboard ของกิจการ (WebView /app) — เปิดด้วย one-time code (60 วิ ใช้ครั้งเดียว)
// ⚠️ ห้ามใส่ Bearer/token ใน URL หรือ header ของ WebView เด็ดขาด — ส่งแค่ ?code=
// ⚠️ ห้ามมี native header — เว็บมี top bar ของตัวเอง · SafeAreaView กันชนติ่งจอ
// UA ต่อท้าย "SharkApp/1" → ฝั่งเว็บซ่อน orb ของตัวเอง (กัน orb ซ้อน) · ปุ่ม orb AI ลอยมุมล่างขวา → /sessions
// เปลี่ยนกิจการ (activeTenantId) → ขอ code ใหม่ reload อัตโนมัติ
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, apiErrorText, BASE_URL } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { C, R, S } from "@/src/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const { activeTenantId } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestCode = useCallback(async () => {
    setError(null);
    setLoading(true);
    setCode(null);
    try {
      const res = await api<{ code: string }>("/api/mobile/webview-session", { body: {} });
      setCode(res.code);
    } catch (e) {
      setError(apiErrorText(e));
      setLoading(false);
    }
  }, []);

  // ขอ code ใหม่ทุกครั้งที่เปลี่ยนกิจการ (code ผูก tenant + ใช้ครั้งเดียว)
  useEffect(() => {
    void requestCode();
  }, [requestCode, activeTenantId]);

  const uri = code ? `${BASE_URL}/api/mobile/webview-exchange?code=${code}` : null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.flex}>
        {uri && (
          <WebView
            source={{ uri }}
            applicationNameForUserAgent="SharkApp/1"
            style={styles.webview}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setError("เปิดระบบงานไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
              setLoading(false);
            }}
            onHttpError={() => {
              setError("เปิดระบบงานไม่สำเร็จ ลองใหม่อีกครั้ง");
              setLoading(false);
            }}
          />
        )}

        {loading && !error && (
          <View style={styles.overlay}>
            <ActivityIndicator color={C.blue} size="large" />
          </View>
        )}

        {error && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={requestCode} style={styles.retryBtn}>
              <Text style={styles.retryText}>ลองใหม่</Text>
            </Pressable>
          </View>
        )}

        {/* ปุ่ม orb AI ลอยมุมล่างขวา (native) — เหมือน icon AI มุมล่างขวาบนเว็บ */}
        <Pressable onPress={() => router.push("/sessions")} hitSlop={8} style={styles.orb}>
          <View style={styles.orbMid} />
          <View style={styles.orbCore} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const ORB = 56;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1, backgroundColor: C.bg },
  webview: { flex: 1, backgroundColor: C.bg },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: S.lg,
    padding: S.xl,
  },
  errorText: { color: C.textDim, fontSize: 15, textAlign: "center" },
  retryBtn: { backgroundColor: C.blue, borderRadius: R.md, paddingHorizontal: S.xl, paddingVertical: S.md, minHeight: 44, justifyContent: "center" },
  retryText: { color: "#ffffff", fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  // orb ทรงกลม 3 ชั้น (ขอบเข้ม→กลางสว่าง) ให้ดูเป็นทรงกลมเรืองแสง + เงาเบา
  orb: {
    position: "absolute",
    right: S.lg,
    bottom: S.lg,
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: C.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.blue,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  orbMid: {
    position: "absolute",
    width: ORB - 8,
    height: ORB - 8,
    borderRadius: (ORB - 8) / 2,
    backgroundColor: C.blue,
  },
  orbCore: {
    width: ORB * 0.42,
    height: ORB * 0.42,
    borderRadius: (ORB * 0.42) / 2,
    backgroundColor: C.blueHi,
  },
});
