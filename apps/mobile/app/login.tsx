// จอเข้าสู่ระบบ — OTP ทางอีเมล (Phase 1: ยังไม่มี social login — ห้ามวางปุ่มหลอก)
// ขั้น 1: กรอกอีเมล → ขอรหัส · ขั้น 2: กรอกรหัส 6 หลัก → ยืนยัน → signIn (gate เด้งต่อเอง)
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError, apiErrorText } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import {
  InlineError,
  LinkButton,
  Orb,
  PrimaryButton,
  inputPlaceholder,
  inputStyle,
} from "@/src/components/auth/ui";
import { C, S } from "@/src/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.center}>
          <Orb size={92} />
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: S.xl },
  brand: {
    color: C.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 2,
    textAlign: "center",
    marginTop: S.lg,
  },
  tagline: { color: C.textDim, fontSize: 14, textAlign: "center", marginTop: S.xs },
  card: { marginTop: S.xl * 1.5 },
  label: { color: C.textDim, fontSize: 14, marginBottom: S.sm },
  emailShown: { color: C.text, fontSize: 15, fontWeight: "600", marginBottom: S.sm },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: "700" },
  gap: { height: S.lg },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: S.xs },
});
