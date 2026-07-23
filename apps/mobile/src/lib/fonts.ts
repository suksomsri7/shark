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
  });
  return loaded;
}
