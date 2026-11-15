// จอ QC ของตัวโหลดโลโก้ Lekaa (dev/QC เท่านั้น · แบบ _gallery) — ?p=0..1 เฟรมนิ่ง · ?size= · ?anim=1 = วนจริง · ?launch=1 = จอเปิดแอป (ไม่ถอดตัวเอง)
//   ใช้ถ่ายภาพเทียบกับ assets/brand/loading-A.gif (qc/shoot-loader.mjs) · build จริง = เด้งกลับ /secretary
import { Redirect, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { LekaaLoader } from "@/src/components/brand/LekaaLoader";
import { LaunchOverlay } from "@/src/components/brand/LaunchOverlay";
import { light } from "@/src/theme/index";

const ENABLED = __DEV__ || process.env.EXPO_PUBLIC_QC === "1";

export default function LoaderQc() {
  const q = useLocalSearchParams<{ p?: string; size?: string; anim?: string; launch?: string }>();
  if (!ENABLED) return <Redirect href="/secretary" />;
  if (q.launch === "1") return <LaunchOverlay ready={false} />;
  const size = Number(q.size) || 240;
  const p = q.anim === "1" ? undefined : Number(q.p ?? 0);
  return (
    <View testID="loader-qc" style={[styles.root, { backgroundColor: light.surface }]}>
      <LekaaLoader size={size} progress={p} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, alignItems: "flex-start", justifyContent: "flex-start" } });
