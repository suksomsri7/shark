// S1 · สมัครใช้ SHARK (ใบ S2.12 · แบบ sec-c หน้า 1) — ชื่อ + เบอร์ + อีเมล → ขอรหัส SMS → /otp (mode=signup)
// อีเมลตอนสมัคร = ยังไม่ยืนยัน (R-S1.19a: server เก็บเป็น pendingEmail) · ป้ายเล็กบอกผู้ใช้
// ค่าเดิมกลับมาทาง query (?name&phone&email) เมื่อกด "แก้เบอร์หรืออีเมล" จากจอ OTP หรือ "สมัครเลย" จาก login ด้วยเบอร์
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AiryScreen, Orb, PrimaryButton } from "@/src/components/airy";
import { AuthField, Hero, LinkLine, NoteLine, StepBar } from "@/src/components/auth/airy";
import { authErrorCode, authErrorKey, smsRequest } from "@/src/lib/auth-api";
import { formatThaiMobileInput, localThaiMobile, normalizeThaiMobile } from "@/src/lib/phone";
import { hasHeldCode } from "@/src/lib/post-signup";
import { useT } from "@/src/i18n";
import { F } from "@/src/theme/index";
import { spacing } from "@/src/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function SignupScreen() {
  const t = useT();
  const router = useRouter();
  const q = useLocalSearchParams<{ name?: string; phone?: string; email?: string; reuse?: string }>();
  const [name, setName] = useState(one(q.name));
  const [phone, setPhone] = useState(formatThaiMobileInput(localThaiMobile(one(q.phone)) ?? one(q.phone)));
  const [email, setEmail] = useState(one(q.email));
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameOk = name.trim().length >= 2;
  const phoneOk = !!normalizeThaiMobile(phone);
  const emailOk = EMAIL_RE.test(email.trim());
  const ready = nameOk && phoneOk && emailOk;
  // บอกเหตุผลเฉพาะช่องที่กรอกแล้วแต่ยังไม่ถูก (ไม่ตะโกนใส่ช่องว่างตั้งแต่เปิดจอ)
  const hint = !touched
    ? null
    : name.trim() && !nameOk
      ? t("auth.signup.nameShort")
      : phone.trim() && !phoneOk
        ? t("auth.common.badPhone")
        : email.trim() && !emailOk
          ? t("auth.signup.emailBad")
          : null;

  async function submit() {
    if (!ready || sending) return;
    setErr(null);
    setSending(true);
    try {
      // มาจาก OTP ที่ยังไม่มีบัญชี (reuse=1) + เบอร์เดิม ⇒ ใช้รหัสเดิมที่ถือไว้ ไม่ขอรหัสใหม่ (§R)
      const local = localThaiMobile(phone) ?? phone;
      const reuse = one(q.reuse) === "1" && hasHeldCode(local);
      const r = reuse ? { resendAfterSec: 60 } : await smsRequest(phone);
      const p = new URLSearchParams({
        phone: localThaiMobile(phone) ?? phone,
        mode: "signup",
        name: name.trim(),
        email: email.trim(),
        resend: String(r.resendAfterSec ?? 60),
        ...(reuse ? { reuse: "1" } : {}),
      });
      router.push(`/otp?${p.toString()}`);
    } catch (e) {
      setErr(t(authErrorKey(authErrorCode(e))));
    } finally {
      setSending(false);
    }
  }

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setTouched(true);
    if (err) setErr(null);
  };

  return (
    <AiryScreen testID="signup">
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <StepBar title={t("auth.common.stepOf", { n: 1, total: 3 })} step={1} />
          <Hero top={F.v(28)} orb={<Orb size={64} />} title={t("auth.signup.title")}>
            {t("auth.signup.sub")}
          </Hero>
          <AuthField
            testID="signup-name"
            top={F.v(26)}
            label={t("auth.signup.name")}
            value={name}
            onChangeText={edit(setName)}
            placeholder={t("auth.signup.namePlaceholder")}
            autoComplete="name"
            textContentType="name"
            maxLength={60}
            editable={!sending}
          />
          <AuthField
            testID="signup-phone"
            label={t("auth.common.phoneLabel")}
            value={phone}
            onChangeText={edit((v) => setPhone(formatThaiMobileInput(v)))}
            placeholder={t("auth.common.phonePlaceholder")}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            editable={!sending}
          />
          <AuthField
            testID="signup-email"
            label={t("auth.signup.email")}
            badge={t("auth.signup.emailUnverified")}
            value={email}
            onChangeText={edit(setEmail)}
            placeholder={t("auth.signup.emailPlaceholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!sending}
            onSubmitEditing={submit}
            returnKeyType="send"
          />
          {hint || err ? <NoteLine tone="error" top={F.v(16)}>{err ?? hint}</NoteLine> : null}
          <NoteLine top={F.v(22)}>{t("auth.signup.terms")}</NoteLine>
        </ScrollView>
        <View style={s.foot}>
          <PrimaryButton testID="signup-submit" label={sending ? t("auth.common.sending") : t("auth.signup.submit")} onPress={submit} disabled={!ready || sending} />
          <LinkLine testID="signup-login" top={F.v(14)} lead={t("auth.signup.haveAccount")} cta={t("auth.signup.login")} onPress={() => router.replace("/login")} />
        </View>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page + 2, paddingTop: F.v(14), paddingBottom: spacing.xl },
  foot: { paddingHorizontal: spacing.page + 4, paddingBottom: F.v(30), paddingTop: spacing.sm },
});
