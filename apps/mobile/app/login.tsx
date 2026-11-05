// จอเข้าสู่ระบบ ธีม Airy (ใบ S2.12 · ไม่มีหน้า login ในแบบ — ประกอบจากชิ้นเดียวกับ S1: orb + การ์ดกระจก + ปุ่มหลัก)
// ทางเข้าหลัก = เบอร์มือถือ → ขอรหัส SMS → /otp?mode=login · ทางเดิมยังอยู่ครบ: อีเมล OTP 2 ขั้น (กด "เข้าด้วยอีเมล") +
// ปุ่ม social (Apple/Google/LINE/Facebook ใช้จริง · TikTok เปิดใช้เร็ว ๆ นี้) · ทุกทางจบที่ signIn(token) แล้วยามหน้าประตูพาไปต่อเอง
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { api, ApiError, apiErrorText } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { AiryScreen, Glass, PrimaryButton } from "@/src/components/airy";
import { AuthField, LinkLine, NoteLine, OtpBoxes } from "@/src/components/auth/airy";
import { SOCIAL_BRAND } from "@/src/components/auth/social";
import { AnimatedOrb } from "@/src/components/ui/orb";
import { authErrorCode, authErrorKey, keepCodeOnError, smsRequest } from "@/src/lib/auth-api";
import { formatThaiMobileInput, localThaiMobile, normalizeThaiMobile } from "@/src/lib/phone";
import { useT } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type } from "@/src/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Google Sign-In (creds เจ้าของ 25 ก.ค. — idToken aud = web client → server ตรวจกับ Google JWKS)
GoogleSignin.configure({
  iosClientId: "732040229931-pudkdofrj1qbj7lbhrfie5m5dpmfi1pv.apps.googleusercontent.com",
  webClientId: "732040229931-nk82v61v46bln5q5rodeuftknn27ok8l.apps.googleusercontent.com",
});

// ปุ่ม social — icon แบรนด์ (FontAwesome6) · สีแบรนด์อยู่ที่ components/auth/social.ts (Apple/TikTok = สีตัวอักษรของธีม)
const SOCIALS = [
  { key: "google", label: "Google" },
  { key: "facebook", label: "Facebook" },
  { key: "apple", label: "Apple" },
  { key: "line", label: "LINE" },
  { key: "tiktok", label: "TikTok" },
] as const;

export default function LoginScreen() {
  const t = useT();
  const { c } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // ข้อความเทา (social ยังไม่เปิด) — ไม่ใช่ error
  const [socialBusy, setSocialBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // นับถอยหลัง cooldown ปุ่มส่งรหัสอีเมลอีกครั้ง
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearMsg = () => {
    setErr(null);
    setNotice(null);
  };

  // ── เบอร์มือถือ: ขอรหัส SMS แล้วไปจอ /otp (mode=login) ──
  async function sendSms() {
    if (!normalizeThaiMobile(phone)) {
      setErr(t("auth.common.badPhone"));
      return;
    }
    clearMsg();
    setSending(true);
    try {
      const r = await smsRequest(phone);
      const p = new URLSearchParams({ phone: localThaiMobile(phone) ?? phone, mode: "login", resend: String(r.resendAfterSec ?? 60) });
      router.push(`/otp?${p.toString()}`);
    } catch (x) {
      setErr(t(authErrorKey(authErrorCode(x)))); // 503 sms_unavailable ⇒ บอกให้ใช้ Apple/Google/อีเมล (ปุ่มอยู่บนจอนี้)
    } finally {
      setSending(false);
    }
  }

  // ── อีเมล OTP เดิม (2 ขั้น) ──
  async function sendOtp() {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setErr(t("auth.login.emailBad"));
      return;
    }
    clearMsg();
    setSending(true);
    try {
      await api("/api/mobile/auth/otp", { body: { email: e }, auth: false, tenant: false });
      setPhase("code");
      setCode("");
      setCooldown(60);
    } catch (x) {
      setErr(apiErrorText(x));
    } finally {
      setSending(false);
    }
  }

  async function verify(value = code) {
    const v = value.trim();
    if (v.length !== 6) {
      setErr(t("auth.login.code6"));
      return;
    }
    setErr(null);
    setVerifying(true);
    try {
      const r = await api<{ token: string; user: { id: string; email: string } }>("/api/mobile/auth/verify", {
        body: { email: email.trim(), code: v },
        auth: false,
        tenant: false,
      });
      await signIn(r.token); // gate จะเด้งไป /phone /dna หรือ /(app) เอง — คาสปินเนอร์ค้างไว้จนหน้าเปลี่ยน
    } catch (x) {
      if (x instanceof ApiError && x.status === 401) setErr(t("auth.login.codeWrong"));
      else setErr(apiErrorText(x));
      // S2.14 (R-S2.14i): ล้มชั่วคราว (เน็ต · ≥500 ยกเว้น 503) ⇒ คงรหัสไว้กด "ยืนยัน" ซ้ำ · รหัสผิด (4xx) ⇒ ล้าง
      if (!keepCodeOnError(x)) setCode("");
      setVerifying(false);
    }
  }

  function editEmail() {
    setPhase("email");
    setCode("");
    clearMsg();
  }

  function switchMethod() {
    setMethod((m) => (m === "phone" ? "email" : "phone"));
    setPhase("email");
    setCode("");
    clearMsg();
  }

  // Apple = ใช้จริง: signInAsync → identityToken → แลก token ฝั่งเรา → signIn
  async function appleSignIn() {
    clearMsg();
    setSocialBusy(true);
    try {
      if (!(await AppleAuthentication.isAvailableAsync())) {
        setErr(t("auth.login.appleUnavailable"));
        return;
      }
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) {
        setErr(t("auth.login.appleFailed"));
        return;
      }
      // ชื่อ Apple ส่งมาแค่ครั้งแรก — มีค่อยส่ง (server เก็บไว้ตั้งชื่อผู้ใช้)
      const name = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ") || undefined
        : undefined;
      const r = await api<{ token: string }>("/api/mobile/auth/apple", {
        body: { identityToken: credential.identityToken, name },
        auth: false,
        tenant: false,
      });
      await signIn(r.token); // gate เด้งต่อเอง — ปล่อยค้างไว้จนหน้าเปลี่ยน
    } catch (x) {
      if ((x as { code?: string }).code === "ERR_REQUEST_CANCELED") return; // ผู้ใช้กดยกเลิก — เงียบ ไม่โชว์ error
      setErr(apiErrorText(x));
    } finally {
      setSocialBusy(false);
    }
  }

  async function googleSignIn() {
    clearMsg();
    setSocialBusy(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false }).catch(() => {});
      const resp = await GoogleSignin.signIn();
      if (!isSuccessResponse(resp)) return; // ผู้ใช้กดยกเลิก — เงียบ
      const idToken = resp.data.idToken;
      if (!idToken) {
        setErr(t("auth.login.googleFailed"));
        return;
      }
      const r = await api<{ token: string }>("/api/mobile/auth/google", {
        body: { idToken },
        auth: false,
        tenant: false,
      });
      await signIn(r.token); // gate เด้งต่อเอง
    } catch (x) {
      if ((x as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) return;
      setErr(apiErrorText(x));
    } finally {
      setSocialBusy(false);
    }
  }

  async function browserSocial(provider: "line" | "facebook") {
    clearMsg();
    setSocialBusy(true);
    try {
      // LINE/Facebook ผ่าน browser → callback เด้งกลับ sharkai://auth?code= → แลกเป็น Bearer
      const result = await WebBrowser.openAuthSessionAsync(`https://shark.in.th/api/auth/${provider}/start?mobile=1`, "sharkai://auth");
      if (result.type !== "success" || !result.url) return; // ผู้ใช้ปิดเอง — เงียบ
      const m = /[?&]code=([^&]+)/.exec(result.url);
      if (!m) {
        setErr(t("auth.login.socialFailed"));
        return;
      }
      const r = await api<{ token: string }>("/api/mobile/auth/exchange", {
        body: { code: m[1] },
        auth: false,
        tenant: false,
      });
      await signIn(r.token);
    } catch (x) {
      setErr(apiErrorText(x));
    } finally {
      setSocialBusy(false);
    }
  }

  function onSocial(key: string, label: string) {
    if (socialBusy) return;
    if (key === "apple") return void appleSignIn();
    if (key === "google") return void googleSignIn();
    if (key === "line") return void browserSocial("line");
    if (key === "facebook") return void browserSocial("facebook");
    // TikTok — creds ยังไม่มา → notice สีเทา (ไม่ใช่ error) ห้ามปุ่มตายเงียบ
    setErr(null);
    setNotice(t("auth.login.socialSoon", { name: label }));
  }

  return (
    <AiryScreen testID="login">
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.hero}>
            <AnimatedOrb size={96} />
            <Text style={[s.brand, { color: c.text }]}>SHARK HUB</Text>
            <Text style={[s.tagline, { color: c.textMuted }]}>{t("auth.login.tagline")}</Text>
          </View>

          <Glass style={s.card} pad={{ v: 6, h: 16 }}>
            {method === "phone" ? (
              <>
                <AuthField
                  testID="login-phone"
                  top={F.v(14)}
                  label={t("auth.login.phoneTitle")}
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(formatThaiMobileInput(v));
                    if (err) setErr(null);
                  }}
                  placeholder={t("auth.common.phonePlaceholder")}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!sending}
                  onSubmitEditing={() => void sendSms()}
                  returnKeyType="send"
                />
                <View style={s.gap} />
                <PrimaryButton testID="login-sms" label={sending ? t("auth.common.sending") : t("auth.login.sendSms")} onPress={() => void sendSms()} disabled={sending} />
              </>
            ) : phase === "email" ? (
              <>
                <AuthField
                  testID="login-email"
                  top={F.v(14)}
                  label={t("auth.login.emailLabel")}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (err || notice) clearMsg();
                  }}
                  placeholder={t("auth.signup.emailPlaceholder")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!sending}
                  onSubmitEditing={() => void sendOtp()}
                  returnKeyType="send"
                />
                <View style={s.gap} />
                <PrimaryButton testID="login-email-request" label={sending ? t("auth.common.sending") : t("auth.login.emailRequest")} onPress={() => void sendOtp()} disabled={sending} />
              </>
            ) : (
              <>
                <NoteLine top={F.v(14)}>{t("auth.login.codeTo")}</NoteLine>
                <Text style={[s.emailShown, { color: c.text }]}>{email.trim()}</Text>
                <OtpBoxes testID="login-code" top={F.v(14)} value={code} onChange={setCode} onFilled={(v) => void verify(v)} editable={!verifying} />
                <View style={s.gap} />
                <PrimaryButton testID="login-verify" label={verifying ? t("auth.common.verifying") : t("auth.common.verify")} onPress={() => void verify()} disabled={verifying || code.length !== 6} />
                <View style={s.row}>
                  <LinkLine
                    testID="login-email-resend"
                    cta={cooldown > 0 ? t("auth.login.resendIn", { sec: cooldown }) : t("auth.login.resend")}
                    onPress={() => void sendOtp()}
                    disabled={cooldown > 0 || sending || verifying}
                  />
                  <LinkLine testID="login-email-edit" cta={t("auth.login.editEmail")} onPress={editEmail} disabled={verifying} />
                </View>
              </>
            )}
            {err ? <NoteLine tone="error" top={F.v(12)}>{err}</NoteLine> : null}
            <View style={s.gapSm} />
          </Glass>

          <LinkLine testID="login-email-toggle" top={F.v(20)} cta={method === "phone" ? t("auth.login.emailToggle") : t("auth.login.phoneToggle")} onPress={switchMethod} />

          {/* social login — ซ่อนตอนกรอกรหัสอีเมล 6 หลัก (ไม่เกี่ยว social) */}
          {phase === "email" && (
            <View style={s.social}>
              <View style={s.dividerRow}>
                <View style={[s.dividerLine, { backgroundColor: c.divider }]} />
                <Text style={[s.dividerText, { color: c.textMuted }]}>{t("auth.login.or")}</Text>
                <View style={[s.dividerLine, { backgroundColor: c.divider }]} />
              </View>
              <View style={s.socialRow}>
                {/* Apple = ปุ่มของ iOS เท่านั้น — บน Android `isAvailableAsync()` คืน false เสมอ
                    โชว์ไว้ = ผู้ใช้กดแล้วเจอ error ทั้งที่ไม่ใช่ความผิดเขา (กติกา: error ห้ามโทษผู้ใช้) */}
                {SOCIALS.filter((x) => x.key !== "apple" || Platform.OS === "ios").map((x) => (
                  <Pressable
                    testID={`login-${x.key}`}
                    key={x.key}
                    onPress={() => onSocial(x.key, x.label)}
                    disabled={socialBusy}
                    accessibilityRole="button"
                    accessibilityLabel={x.label}
                    hitSlop={6}
                    style={({ pressed }) => [glassStyle(c, radii.round), s.socialBtn, pressed && s.pressed, socialBusy && s.off]}
                  >
                    <FontAwesome6 name={x.key} size={22} color={SOCIAL_BRAND[x.key] ?? c.text} />
                  </Pressable>
                ))}
              </View>
              {notice ? <NoteLine top={F.v(16)}>{notice}</NoteLine> : null}
            </View>
          )}

          <LinkLine testID="login-signup" top={F.v(30)} lead={t("auth.login.noAccount")} cta={t("auth.login.signupCta")} onPress={() => router.push("/signup")} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  page: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.page + 2, paddingVertical: spacing.xl },
  hero: { alignItems: "center" },
  brand: { fontSize: 28, fontWeight: "700", letterSpacing: 2, textAlign: "center", marginTop: spacing.md },
  tagline: { fontSize: type.sub, textAlign: "center", marginTop: spacing.xs },
  card: { marginTop: F.v(36) },
  emailShown: { fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: spacing.xs },
  gap: { height: spacing.lg },
  gapSm: { height: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  social: { marginTop: F.v(26) },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  socialRow: { flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: spacing.lg },
  socialBtn: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
  off: { opacity: 0.45 },
});
