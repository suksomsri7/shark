// โหลดฟอนต์ไทย IBM Plex Sans Thai (ชุดเดียวกับเว็บ) — ใช้ครอบทั้งแอปใน _layout
// คืน true เมื่อโหลดเสร็จ (ระหว่างโหลดให้จอ root คง splash / return null)
import {
  useFonts,
  IBMPlexSansThai_400Regular,
  IBMPlexSansThai_500Medium,
  IBMPlexSansThai_600SemiBold,
  IBMPlexSansThai_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-thai";

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    IBMPlexSansThai_400Regular,
    IBMPlexSansThai_500Medium,
    IBMPlexSansThai_600SemiBold,
    IBMPlexSansThai_700Bold,
    // AI TEAM T0.3 ▸ Inter = อักษรละติน/ตัวเลขของจอทีมพนักงาน AI (mockup: font-family Inter, 'IBM Plex Sans Thai' · น้ำหนักที่ CSS ใช้ 300–700) · require รายน้ำหนักจาก @expo-google-fonts/inter (ไม่ลากอีก 13 ไฟล์เข้า bundle) · จอ 1.0 ไม่ใช้
    Inter_300Light: require("@expo-google-fonts/inter/300Light/Inter_300Light.ttf"),
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_500Medium: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
    // AI TEAM T0.3 ◂
  });
  return loaded;
}

