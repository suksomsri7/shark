// จอเข้าสู่ระบบ — OTP ทางอีเมล + ปุ่ม social (Apple ใช้จริง · อื่น ๆ เปิดใช้เร็ว ๆ นี้ — ห้ามปุ่มตายเงียบ)
// ขั้น 1: กรอกอีเมล → ขอรหัส · ขั้น 2: กรอกรหัส 6 หลัก → ยืนยัน → signIn (gate เด้งต่อเอง)
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Text, TextInput } from "@/src/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, apiErrorText } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import {
  InlineError,
  LinkButton,
  PrimaryButton,
  inputPlaceholder,
  inputStyle,
} from "@/src/components/auth/ui";
import { AnimatedOrb } from "@/src/components/ui/orb";
import { C, R, S } from "@/src/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ปุ่ม social — icon แบรนด์ (FontAwesome6) · Apple ใช้จริง · อื่น ๆ ยังไม่มี creds → notice สีเทา
const SOCIALS = [
  { key: "google", label: "Google", color: "#DB4437" },
  { key: "facebook", label: "Facebook", color: "#1877F2" },
  { key: "apple", label: "Apple", color: C.text },
  { key: "line", label: "LINE", color: "#06C755" },
  { key: "tiktok", label: "TikTok", color: C.text },
] as const;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // ข้อความเทา (social ยังไม่เปิด) — ไม่ใช่ error
  const [socialBusy, setSocialBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // นับถอยหลัง cooldown ปุ่มส่งรหัสอีกครั้ง
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

  async function sendOtp() {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setErr("กรุณากรอกอีเมลให้ถูกต้อง");
      return;
    }
    setErr(null);
    setNotice(null);
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

  async function verify() {
    const c = code.trim();
    if (c.length !== 6) {
      setErr("กรุณากรอกรหัส 6 หลัก");
      return;
    }
    setErr(null);
    setVerifying(true);
    try {
      const r = await api<{ token: string; user: { id: string; email: string } }>(
        "/api/mobile/auth/verify",
        { body: { email: email.trim(), code: c }, auth: false, tenant: false },
      );
      await signIn(r.token); // gate จะเด้งไป /dna หรือ /(app) เอง — คาสปินเนอร์ค้างไว้จนหน้าเปลี่ยน
    } catch (x) {
      if (x instanceof ApiError && x.status === 401) setErr("รหัสไม่ถูกต้องหรือหมดอายุ");
      else setErr(apiErrorText(x));
      setVerifying(false);
    }
  }

  function editEmail() {
    setPhase("email");
    setCode("");
    setErr(null);
    setNotice(null);
  }

  // Apple = ใช้จริง: signInAsync → identityToken → แลก token ฝั่งเรา → signIn
  async function appleSignIn() {
    setErr(null);
    setNotice(null);
    setSocialBusy(true);
    try {
      if (!(await AppleAuthentication.isAvailableAsync())) {
        setErr("อุปกรณ์นี้ไม่รองรับการเข้าสู่ระบบด้วย Apple");
        return;
      }
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setErr("เข้าสู่ระบบด้วย Apple ไม่สำเร็จ ลองใหม่อีกครั้ง");
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

  function onSocial(key: string, label: string) {
    if (socialBusy) return;
    if (key === "apple") {
      void appleSignIn();
      return;
    }
    // Google/Facebook/LINE/TikTok — creds ยังไม่มา → notice สีเทา (ไม่ใช่ error) ห้ามปุ่มตายเงียบ
    setErr(null);
    setNotice(`เข้าสู่ระบบด้วย ${label} จะเปิดใช้เร็ว ๆ นี้ — ตอนนี้ใช้อีเมลได้เลย`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.center}>
          <AnimatedOrb size={96} />
          <Text style={styles.brand}>SHARK AI</Text>
          <Text style={styles.tagline}>ผู้ช่วย AI ประจำกิจการของคุณ</Text>

          <View style={styles.card}>
            {phase === "email" ? (
              <>
                <Text style={styles.label}>อีเมลของคุณ</Text>
                <TextInput
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (err) setErr(null);
                    if (notice) setNotice(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={inputPlaceholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!sending}
                  style={inputStyle}
                  onSubmitEditing={sendOtp}
                  returnKeyType="send"
                />
                <InlineError text={err} />
                <View style={styles.gap} />
                <PrimaryButton label="ขอรหัสเข้าสู่ระบบ" onPress={sendOtp} loading={sending} />
              </>
            ) : (
              <>
                <Text style={styles.label}>กรอกรหัส 6 หลักที่ส่งไปที่</Text>
                <Text style={styles.emailShown}>{email.trim()}</Text>
                <TextInput
                  value={code}
                  onChangeText={(t) => {
                    setCode(t.replace(/[^0-9]/g, "").slice(0, 6));
                    if (err) setErr(null);
                  }}
                  placeholder="______"
                  placeholderTextColor={inputPlaceholder}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!verifying}
                  style={[inputStyle, styles.codeInput]}
                  onSubmitEditing={verify}
                  returnKeyType="done"
                />
                <InlineError text={err} />
                <View style={styles.gap} />
                <PrimaryButton label="ยืนยัน" onPress={verify} loading={verifying} />
                <View style={styles.row}>
                  <LinkButton
                    label={cooldown > 0 ? `ส่งรหัสอีกครั้ง (${cooldown})` : "ส่งรหัสอีกครั้ง"}
                    onPress={sendOtp}
                    disabled={cooldown > 0 || sending || verifying}
                  />
                  <LinkButton label="แก้อีเมล" onPress={editEmail} disabled={verifying} tone="dim" />
                </View>
              </>
            )}
          </View>

          {/* social login — ซ่อนตอนกรอกรหัส 6 หลัก (ไม่เกี่ยว social) */}
          {phase === "email" && (
            <View style={styles.social}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>หรือเข้าสู่ระบบด้วย</Text>
                <View style={styles.dividerLine} />
              </View>
              <View style={styles.socialRow}>
                {SOCIALS.map((s) => (
                  <Pressable
                    key={s.key}
                    onPress={() => onSocial(s.key, s.label)}
                    disabled={socialBusy}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.socialBtn,
                      pressed && styles.socialBtnPressed,
                      socialBusy && styles.socialBtnOff,
                    ]}
                  >
                    <FontAwesome6 name={s.key} size={22} color={s.color} />
                  </Pressable>
                ))}
              </View>
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: S.xl },
  brand: {
    color: C.text,
    fontSize: 30,
    fontFamily: "IBMPlexSansThai_700Bold",
    letterSpacing: 2,
    textAlign: "center",
    marginTop: S.lg,
  },
  tagline: { color: C.textDim, fontSize: 14, textAlign: "center", marginTop: S.xs },
  card: { width: "100%", marginTop: S.xl * 1.5 },
  label: { color: C.textDim, fontSize: 14, marginBottom: S.sm },
  emailShown: { color: C.text, fontSize: 15, fontWeight: "600", marginBottom: S.sm },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: "700" },
  gap: { height: S.lg },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: S.xs },
  social: { width: "100%", marginTop: S.xl },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.textDim, fontSize: 13 },
  socialRow: { flexDirection: "row", justifyContent: "center", gap: S.md, marginTop: S.lg },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  socialBtnPressed: { backgroundColor: C.surfaceHi },
  socialBtnOff: { opacity: 0.45 },
  notice: { color: C.textDim, fontSize: 13, textAlign: "center", marginTop: S.lg },
});
