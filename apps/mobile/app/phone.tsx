// R8 · บัญชีเดิมที่ยังไม่มีเบอร์ต้องผูกเบอร์ก่อนใช้งาน (ใบ S2.12) — ยามหน้าประตู (app/_layout.tsx) พามาเมื่อ /me ตอบ user.phone = null
// ขั้น 1 ใส่เบอร์ → รับรหัส SMS · ขั้น 2 รหัส 6 ช่องในหน้าเดียว → POST /api/mobile/auth/phone/link (Bearer) → refreshMe ⇒ ยามพาไปต่อเอง
// ทางออกจากจอนี้มีทางเดียวคือออกจากระบบ (มติ R8 — ไม่มีปุ่มให้ผ่านไปโดยไม่ผูกเบอร์)
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { AiryScreen, Orb, PrimaryButton } from "@/src/components/airy";
import { AuthField, GlassButton, Hero, LinkLine, NoteLine, OtpBoxes, fy } from "@/src/components/auth/airy";
import { authErrorCode, authErrorKey, phoneLink, smsRequest } from "@/src/lib/auth-api";
import { formatThaiMobileInput, maskPhone, normalizeThaiMobile } from "@/src/lib/phone";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { spacing } from "@/src/theme/tokens";

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export default function PhoneLinkScreen() {
  const t = useT();
  const { refreshMe, signOut } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const phoneOk = !!normalizeThaiMobile(phone);

  // เหตุผลจาก server → ข้อความของจอนี้ (phone_taken ที่นี่ = เบอร์ของบัญชีอื่น · 503 = ยังส่ง SMS ไม่ได้)
  function reason(e: unknown): string {
    const why = authErrorCode(e);
    if (why === "phone_taken") return t("auth.phone.taken");
    if (why === "sms_unavailable") return t("auth.phone.unavailable");
    if (why === "unauthorized") return t("auth.phone.session");
    return t(authErrorKey(why));
  }

  async function request() {
    if (!phoneOk || busy) {
      if (!phoneOk) setErr(t("auth.common.badPhone"));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const r = await smsRequest(phone);
      setLeft(r.resendAfterSec ?? 60);
      setCode("");
      setStep("code");
    } catch (e) {
      setErr(reason(e));
    } finally {
      setBusy(false);
    }
  }

  async function link(value = code) {
    if (value.length !== 6 || busy) return;
    setErr(null);
    setBusy(true);
    try {
      await phoneLink(phone, value);
      await refreshMe(); // /me ได้เบอร์แล้ว ⇒ ยามหน้าประตูพาไปหน้าถัดไปเอง
    } catch (e) {
      const why = authErrorCode(e);
      setErr(reason(e));
      if (why === "invalid") setShakeKey((k) => k + 1);
      if (why === "expired" || why === "locked" || why === "not_found") setLeft(0);
      setCode("");
      setBusy(false);
    }
  }

  return (
    <AiryScreen testID="phone">
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Hero top={fy(88)} orb={<Orb size={64} />} title={t("auth.phone.title")}>
            {step === "phone" ? t("auth.phone.sub") : t("auth.phone.codeSent", { phone: maskPhone(phone) })}
          </Hero>

          {step === "phone" ? (
            <AuthField
              testID="phone-input"
              top={fy(26)}
              label={t("auth.common.phoneLabel")}
              value={phone}
              onChangeText={(v) => {
                setPhone(formatThaiMobileInput(v));
                if (err) setErr(null);
              }}
              placeholder={t("auth.common.phonePlaceholder")}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!busy}
              onSubmitEditing={() => void request()}
              returnKeyType="send"
            />
          ) : (
            <>
              <OtpBoxes testID="phone-otp" top={fy(30)} value={code} onChange={setCode} onFilled={(v) => void link(v)} shakeKey={shakeKey} editable={!busy} />
              <LinkLine
                testID="phone-resend"
                top={fy(26)}
                lead={left > 0 ? t("auth.otp.resendIn", { time: clock(left) }) : undefined}
                cta={left > 0 ? "" : t("auth.otp.resend")}
                disabled={left > 0 || busy}
                onPress={() => void request()}
              />
              <LinkLine testID="phone-change" top={fy(8)} cta={t("auth.phone.changePhone")} onPress={() => { setStep("phone"); setCode(""); setErr(null); }} />
            </>
          )}

          {err ? <NoteLine tone="error" top={fy(20)}>{err}</NoteLine> : null}
        </ScrollView>
        <View style={s.foot}>
          {step === "phone" ? (
            <PrimaryButton testID="phone-request" label={busy ? t("auth.common.sending") : t("auth.phone.request")} onPress={() => void request()} disabled={!phoneOk || busy} />
          ) : (
            <PrimaryButton testID="phone-submit" label={busy ? t("auth.common.verifying") : t("auth.phone.submit")} onPress={() => void link()} disabled={code.length !== 6 || busy} />
          )}
          <View style={s.gap} />
          <GlassButton testID="phone-logout" tone="danger" label={t("auth.phone.logout")} onPress={() => void signOut()} />
        </View>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page + 2, paddingTop: fy(14), paddingBottom: spacing.xl },
  foot: { paddingHorizontal: spacing.page + 4, paddingBottom: fy(30), paddingTop: spacing.sm },
  gap: { height: spacing.md },
});
