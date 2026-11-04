// Root layout — ยามหน้าประตูของทั้งแอป (บังคับ login → ไม่มีกิจการ → DNA สร้างกิจการแรก)
// โครง route: /login /dna (นอกกิจการ) · /(app)/* = ใน drawer กิจการ (Builder A/B เติมจอ)
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/src/lib/auth-context";
import { useAppFonts } from "@/src/lib/fonts";
import { clearSignedUp, isFreshSignup } from "@/src/lib/post-signup";
import { C } from "@/src/theme";


function Gate({ children }: { children: React.ReactNode }) {
  const { ready, token, tenants, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return; // รอ bootstrap เสร็จก่อน อย่าเด้งมั่ว
    const inApp = segments[0] === "(app)";
    const atLogin = segments[0] === "login";
    const atDna = segments[0] === "dna";
    // S2.12: สมัคร/OTP เปิดได้โดยยังไม่ login · R8: มี token แต่ /me ไม่มีเบอร์ → /phone ก่อนตรวจร้าน (ไม่มีทางผ่าน)
    const atSignup = segments[0] === "signup" || segments[0] === "otp";
    if (!token) {
      if (!atLogin && !atSignup) router.replace("/login");
      return;
    }
    if (user?.phone === null) {
      if (segments[0] !== "phone") router.replace("/phone");
      return;
    }
    // S2.12: เพิ่งสมัครด้วยเบอร์ ⇒ ไม่มีกิจการไป G1 /business/new · มีกิจการไป C1 /secretary/onboarding/name (ครั้งเดียว)
    const fresh = isFreshSignup();
    if (tenants.length === 0) {
      if (fresh) {
        if (!(inApp && (segments as string[])[1] === "business")) router.replace("/business/new");
        return;
      }
      // login แล้วแต่ยังไม่มีกิจการ → บังคับเข้า DNA Wizard สร้างกิจการแรก (คำสั่งเจ้าของ)
      if (!atDna) router.replace("/dna");
      return;
    }
    if (fresh) {
      clearSignedUp();
      router.replace("/secretary/onboarding/name");
      return;
    }
    if (atLogin || (!inApp && !atDna)) router.replace("/(app)");
  }, [ready, token, tenants.length, user?.phone, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  // ยังโหลดฟอนต์ไม่เสร็จ — คง splash ไว้ (อย่าเพิ่งวาด UI ด้วยฟอนต์ระบบ)
  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthProvider>
        <Gate>
          <StatusBar style="dark" />
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
