// หน้าแรกหลัง login = dashboard ของกิจการ (WebView /app) — เปิดด้วย one-time code (60 วิ ใช้ครั้งเดียว)
// ⚠️ ห้ามใส่ Bearer/token ใน URL หรือ header ของ WebView เด็ดขาด — ส่งแค่ ?code=
// ⚠️ ห้ามมี native header — เว็บมี top bar ของตัวเอง · SafeAreaView กันชนติ่งจอ
// UA ต่อท้าย "SharkApp/1" → ฝั่งเว็บซ่อน orb ของตัวเอง (กัน orb ซ้อน) · ปุ่ม orb AI ลอยมุมล่างขวา → /sessions
// เปลี่ยนกิจการ (activeTenantId) → ขอ code ใหม่ reload อัตโนมัติ
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, apiErrorText, BASE_URL } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { C, R, S } from "@/src/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const { activeTenantId, signOut } = useAuth();

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

  // เว็บใน WebView logout เอง → cookie เว็บตายแต่แอปยัง login → กัน webview ค้างหน้า error
  // เทียบด้วย pathname ของ host shark.in.th เท่านั้น (อย่า includes ตรง ๆ กันชนกับ path อื่นที่มีคำว่า login)
  const onShouldStartLoadWithRequest = useCallback(
    (req: { url: string }) => {
      let path: string;
      let search: string;
      try {
        const u = new URL(req.url);
        if (u.host !== new URL(BASE_URL).host) return true; // host อื่น (เช่น gateway) ปล่อยผ่าน
        path = u.pathname;
        search = u.search;
      } catch {
        return true;
      }
      if (path === "/login") {
        if (search.includes("err=code")) {
          void requestCode(); // code หมดอายุ — ขอใหม่แล้วโหลดซ้ำ
        } else {
          void signOut(); // session เว็บจบ — logout ฝั่ง native (gate พาไปจอ login แอปเอง)
        }
        return false;
      }
      if (path === "/") {
        void signOut(); // logout เว็บ redirect กลับ landing root — session เว็บจบ
        return false;
      }
      return true; // /app/*, /api/mobile/webview-exchange ฯลฯ โหลดตามปกติ
    },
    [requestCode, signOut],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.flex}>
        {uri && (
          <WebView
            source={{ uri }}
            applicationNameForUserAgent="SharkApp/1"
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
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

        {/* ปุ่ม orb AI ลอยมุมล่างขวา (native) — วงแหวนน้ำเงินเรืองแสงแบบเว็บ (glow อยู่ในตัว png) */}
        <Pressable onPress={() => router.push("/sessions")} hitSlop={16} style={styles.orb}>
          <Image source={require("../../assets/orb.png")} style={styles.orbImg} resizeMode="contain" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

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
  // ปุ่ม orb ลอย — รูป orb.png มี glow ในตัว ไม่ต้องมีพื้นวงกลม/เงา container
  orb: {
    position: "absolute",
    right: S.lg,
    bottom: S.lg,
  },
  orbImg: { width: 64, height: 64 },
});
