// จอระบบงาน — เปิด /app ผ่าน WebView ด้วย one-time code (60 วิ ใช้ครั้งเดียว)
// ⚠️ ห้ามใส่ Bearer/token ใน URL หรือ header ของ WebView เด็ดขาด — ส่งแค่ ?code=
// เปลี่ยนกิจการ (activeTenantId) → ขอ code ใหม่ reload อัตโนมัติ
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { api, apiErrorText, BASE_URL } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { C, R, S } from "@/src/theme";

export default function WebViewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (navigation as unknown as { openDrawer: () => void }).openDrawer()}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Text style={styles.hamburger}>☰</Text>
        </Pressable>
        <Text style={styles.headerTitle}>ระบบงาน</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.flex}>
        {uri && (
          <WebView
            source={{ uri }}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  iconBtn: { width: 34, alignItems: "flex-start", justifyContent: "center", padding: S.xs },
  hamburger: { color: C.text, fontSize: 22 },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: "600", textAlign: "center" },
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
  retryText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
});
