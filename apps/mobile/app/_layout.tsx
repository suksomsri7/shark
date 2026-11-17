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
import * as SplashScreen from "expo-splash-screen";
import { LaunchOverlay } from "@/src/components/brand/LaunchOverlay";

// เปิดแอป (15 พ.ย. เจ้าของสั่ง): คง splash ของเครื่องไว้จนจอเปิดแอป (LaunchOverlay · โลโก้เคลื่อนไหวใหญ่) วาดทับตำแหน่งเดียวกันแล้วค่อยซ่อน
void SplashScreen.preventAutoHideAsync().catch(() => {});


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
    if (tenants.length === 0) {
      // login แล้วแต่ยังไม่มีกิจการ → บังคับเข้า DNA Wizard สร้างกิจการแรก (คำสั่งเจ้าของ) · /business/new (G1) เปิดได้แต่ไม่บังคับ (R-S2.12a)
      // S2.21 (สลับธงตาม R-S2.12a): เพิ่งสมัครด้วยเบอร์ (ธงผูก user.id) ⇒ G1 /business/new จริง แทน /dna · ธงล้างเมื่อสร้างกิจการแรกเสร็จ
      const atBusiness = inApp && (segments as string[])[1] === "business";
      if (isFreshSignup(user?.id)) {
        if (!atBusiness) router.replace("/business/new");
        return;
      }
      if (!atDna && !atBusiness) router.replace("/dna");
      return;
    }
    // S2.12: เพิ่งสมัครด้วยเบอร์ (ธงผูก user.id) + มีกิจการ ⇒ C1 ตั้งชื่อเลขา ครั้งเดียว
    if (isFreshSignup(user?.id)) {
      clearSignedUp();
      router.replace("/secretary/onboarding/name");
      return;
    }
    // 15 พ.ย. (เจ้าของสั่ง · Lekaa FAB): เปิดแอป/login เสร็จ ⇒ หน้าหลักร้าน = dashboard "/" (WebView) · เลขาเข้าจากปุ่มลอย Lekaa ทุกจอ
    //   (14 พ.ย. เคยเปลี่ยนเป็น /secretary — ถอยกลับตามแบบ fab6)
    if (atLogin || (!inApp && !atDna)) router.replace("/");
  }, [ready, token, tenants.length, user?.phone, user?.id, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const fontsReady = useAppFonts();
  // ยังโหลดฟอนต์ไม่เสร็จ — ยังไม่วาด UI (ฟอนต์ระบบ) · จอเปิดแอปทับอยู่จนฟอนต์ + auth พร้อม และวิ่งครบ 1 รอบ
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthProvider>
        {fontsReady ? (
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
        ) : null}
        <LaunchGate fontsReady={fontsReady} />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

/** จอเปิดแอปรอ auth (bootstrap token/me) + ฟอนต์ */
function LaunchGate({ fontsReady }: { fontsReady: boolean }) {
  const { ready } = useAuth();
  return <LaunchOverlay ready={fontsReady && ready} />;
}
