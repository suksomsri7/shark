// Root layout — ยามหน้าประตูของทั้งแอป (บังคับ login → ไม่มีกิจการ → DNA สร้างกิจการแรก)
// โครง route: /login /dna (นอกกิจการ) · /(app)/* = ใน drawer กิจการ (Builder A/B เติมจอ)
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/src/lib/auth-context";
import { C } from "@/src/theme";

function Gate({ children }: { children: React.ReactNode }) {
  const { ready, token, tenants } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return; // รอ bootstrap เสร็จก่อน อย่าเด้งมั่ว
    const inApp = segments[0] === "(app)";
    const atLogin = segments[0] === "login";
    const atDna = segments[0] === "dna";
    if (!token) {
      if (!atLogin) router.replace("/login");
      return;
    }
    if (tenants.length === 0) {
      // login แล้วแต่ยังไม่มีกิจการ → บังคับเข้า DNA Wizard สร้างกิจการแรก (คำสั่งเจ้าของ)
      if (!atDna) router.replace("/dna");
      return;
    }
    if (atLogin || (!inApp && !atDna)) router.replace("/(app)");
  }, [ready, token, tenants.length, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthProvider>
        <Gate>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              animation: "fade",
            }}
          />
        </Gate>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
