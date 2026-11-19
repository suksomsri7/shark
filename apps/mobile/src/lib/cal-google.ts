// เชื่อม Google Calendar ฝั่งแอป (CAL2.10 · สัญญา §10.1 · R-CAL-17) — ใช้ @react-native-google-signin ที่มีอยู่ ไม่ใช้ expo-auth-session
//   1) configure ใหม่ด้วย offlineAccess + forceCodeForRefreshToken (ให้ Google ออก refresh token ทุกครั้ง · ข้อ M ของ cal-review-b) + scope ปฏิทิน 2 ตัว
//   2) signOut ก่อน (ให้ผู้ใช้เลือกบัญชี/ยินยอมใหม่ · ไม่กระทบการล็อกอินแอป — แอปใช้ idToken ครั้งเดียวตอนล็อกอิน)
//   3) signIn → serverAuthCode → POST calendar/google/connect (เซิร์ฟเวอร์แลก code + ตรวจ scope · ไม่ครบ = 400 scope_missing ข้อความไทย)
//   native: ไม่ต้องแก้ app.json — plugin google-signin + iosUrlScheme มีอยู่แล้ว · scope เพิ่มขอได้ตอนรันไทม์ (หน้าจอยินยอมของ Google)
import { Platform } from "react-native";
import { GoogleSignin, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { calApi, type GoogleLinkDto } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "@/src/lib/google-client";

export const GOOGLE_CAL_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"];

export type ConnectResult = { ok: true; link: GoogleLinkDto } | { ok: false; cancelled?: boolean; message: string };

export async function connectGoogleCalendar(fallbackError: string): Promise<ConnectResult> {
  if (Platform.OS === "web") return { ok: false, message: fallbackError };
  try {
    GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: true, forceCodeForRefreshToken: true, scopes: GOOGLE_CAL_SCOPES });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }).catch(() => {});
    await GoogleSignin.signOut().catch(() => {});
    const resp = await GoogleSignin.signIn();
    if (!isSuccessResponse(resp)) return { ok: false, cancelled: true, message: "" };
    const code = resp.data.serverAuthCode;
    if (!code) return { ok: false, message: fallbackError };
    const link = await calApi.googleConnect(code);
    return { ok: true, link };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) return { ok: false, cancelled: true, message: "" };
    return { ok: false, message: e instanceof Error && "status" in e ? apiErrorText(e) : fallbackError };
  } finally {
    // คืนค่าตั้งต้นของจอล็อกอิน (ไม่ขอ scope ปฏิทินตอนล็อกอิน)
    try {
      GoogleSignin.configure({ iosClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID });
    } catch {
      /* เว็บ */
    }
  }
}
