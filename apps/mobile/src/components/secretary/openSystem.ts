// เปิดระบบจากไอคอนระบบ (แถบบน topbar2 + ตารางในแผ่นดึงลง · 17 พ.ย.) — ทางเดียวกันทั้ง 2 ที่ (แตะไอคอนบนแถบ = แตะช่องเดียวกันในตาราง)
//   ระบบเว็บ = หน้าระบบ "/" (WebView) ด้วย ?open=<href>&t=<nonce> (M3.11 OPEN_PATH_RE ใน app/(app)/index.tsx · t = แตะซ้ำแล้วยังเปิดอีก)
//   15 พ.ย. (เจ้าของสั่ง): ระบบแชทลูกค้า (CHAT · มีสิทธิ์อ่าน) = จอแชท native /customers — เลิกใช้หน้าแชทเว็บในแอป
//     (ไม่มีสิทธิ์อ่าน ⇒ href = หน้าตั้งค่าช่องทาง /chat/channels ของเว็บ ยังเปิดใน WebView ได้)
//   แผ่นเปิดอยู่ = ปิดก่อนแล้วค่อยไป
// 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): ช่อง TEAM / CALENDAR (NATIVE_CODES) = จอ native ของโซน
//   href = /secretary/staff · /secretary/calendar (router.navigate แบบปุ่มโซนเดิม)
import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useBusinessSwitcher } from "./BusinessSwitcherSheet";
import { NATIVE_CODES } from "./navSystems";

export function useOpenSystem(): (href: string, code?: string) => void {
  const router = useRouter();
  const switcher = useBusinessSwitcher();
  return useCallback(
    (href: string, code?: string) => {
      switcher.close();
      if (code && NATIVE_CODES.includes(code)) {
        router.navigate(href);
        return;
      }
      if (code === "CHAT" && !href.includes("/chat/channels")) {
        router.navigate("/customers");
        return;
      }
      router.navigate({ pathname: "/", params: { open: encodeURI(href), t: String(Date.now()) } });
    },
    [router, switcher],
  );
}
