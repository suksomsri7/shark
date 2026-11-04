// S2 · ใส่รหัสจาก SMS (ใบ S2.12 · แบบ sec-c หน้า 2) — query: phone · mode=signup|login · (signup) name, email · resend (วินาที)
// verify → token ⇒ signIn (ยามหน้าประตูใน app/_layout.tsx พาไปต่อเอง) · ไม่มีบัญชี (needSignup / 404 no_account) ⇒ การ์ดชวนสมัคร
// 401 รหัสผิด ⇒ สั่นช่อง · หมดอายุ/ล็อก ⇒ ส่งรหัสใหม่ได้ทันที · 503 sms_unavailable ⇒ ข้อความ + ปุ่มกลับไปเข้าวิธีอื่น (Apple/Google/อีเมล ที่ /login)
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, PrimaryButton } from "@/src/components/airy";
import { GlassButton, Hero, LinkLine, NoteLine, OtpBoxes, StepBar } from "@/src/components/auth/airy";
import { attemptsLeftOf, authErrorCode, authErrorKey, smsRequest, smsVerify } from "@/src/lib/auth-api";
import { localThaiMobile, maskPhone } from "@/src/lib/phone";
import { useAuth } from "@/src/lib/auth-context";
import { clearSignedUp, markSignedUp } from "@/src/lib/post-signup";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { spacing, type } from "@/src/theme/tokens";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export default function OtpScreen() {
  const t = useT();
  const { c } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const q = useLocalSearchParams<{ phone?: string; mode?: string; name?: string; email?: string; resend?: string }>();
  const phone = one(q.phone);
  const signup = one(q.mode) === "signup";
  const name = one(q.name);
  const email = one(q.email);

  const [code, setCode] = useState("");
  const [left, setLeft] = useState(() => Math.max(0, Number(one(q.resend)) || 60));
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [noAccount, setNoAccount] = useState(false);
  const [smsDown, setSmsDown] = useState(false);

  // นับถอยหลังปุ่ม "ส่งรหัสอีกครั้ง" (resendAfterSec จาก sms/request)
  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function verify(value = code) {
    if (value.length !== 6 || busy) return;
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await smsVerify(phone, value, signup ? { name, email } : undefined);
      if (r.needSignup) {
        setNoAccount(true);
        setBusy(false);
        return;
      }
      // บัญชีใหม่ (สมัครจากจอนี้) ⇒ ยามพาไป G1/C1 แทนหน้าแรก · เบอร์ที่มีบัญชีอยู่แล้ว (isNew:false) = เข้าใช้ตามปกติ
      if (r.isNew) markSignedUp();
      await signIn(r.token); // ยามหน้าประตูเด้งต่อเอง — คาสถานะ busy ไว้จนจอเปลี่ยน
    } catch (e) {
      clearSignedUp();
      const why = authErrorCode(e);
      if (why === "no_account") setNoAccount(true);
      else if (why === "sms_unavailable") setSmsDown(true);
      else {
        const n = attemptsLeftOf(e);
        setErr(n !== null && (why === "invalid" || why === "bad_code") ? t("auth.otp.badCodeLeft", { n }) : t(authErrorKey(why)));
        if (why === "invalid" || why === "bad_code") setShakeKey((k) => k + 1);
        // หมดอายุ/ล็อก/ไม่พบรหัส ⇒ รหัสเดิมใช้ไม่ได้แล้ว: ล้างช่อง + เปิดปุ่มส่งใหม่ทันที
        if (why === "expired" || why === "locked" || why === "not_found") setLeft(0);
      }
      setCode("");
      setBusy(false);
    }
  }

  async function resend() {
    if (left > 0 || resending) return;
    setErr(null);
    setInfo(null);
    setResending(true);
    try {
      const r = await smsRequest(phone);
      setLeft(r.resendAfterSec ?? 60);
      setCode("");
      setInfo(t("auth.otp.resent"));
    } catch (e) {
      const why = authErrorCode(e);
      if (why === "sms_unavailable") setSmsDown(true);
      else setErr(t(authErrorKey(why)));
    } finally {
      setResending(false);
    }
  }

  // แก้ข้อมูลสมัคร: กลับ /signup พร้อมค่าเดิม (รหัสเดิมยังใช้ได้ถ้ายังไม่หมดอายุ)
  function editSignup() {
    const p = new URLSearchParams({ name, phone: localThaiMobile(phone) ?? phone, email });
    router.replace(`/signup?${p.toString()}`);
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace(signup ? "/signup" : "/login"));

  return (
    <AiryScreen testID="otp">
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <StepBar
            title={signup ? t("auth.common.stepOf", { n: 2, total: 3 }) : t("auth.otp.loginTitle")}
            step={signup ? 2 : undefined}
            onBack={back}
            backTestID="otp-back"
            backLabel={t("auth.common.back")}
          />
          <Hero top={F.v(50)} title={t("auth.otp.title")}>
            {t("auth.otp.sentTo")} <Text style={[s.b, { color: c.textDim }]}>{maskPhone(phone)}</Text> {t("auth.otp.sentToTail")}
            {"\n"}
            {t("auth.otp.expires")}
          </Hero>

          <OtpBoxes testID="otp-input" top={F.v(30)} value={code} onChange={setCode} onFilled={(v) => void verify(v)} shakeKey={shakeKey} editable={!busy && !noAccount} />

          {err ? <NoteLine tone="error" top={F.v(20)}>{err}</NoteLine> : null}
          {info && !err ? <NoteLine tone="ok" top={F.v(20)}>{info}</NoteLine> : null}

          <LinkLine
            testID="otp-resend"
            top={F.v(26)}
            lead={left > 0 ? t("auth.otp.resendIn", { time: clock(left) }) : undefined}
            cta={left > 0 ? "" : resending ? t("auth.common.sending") : t("auth.otp.resend")}
            disabled={left > 0 || resending}
            onPress={() => void resend()}
          />
          {signup ? (
            <LinkLine testID="otp-edit-email" top={F.v(8)} lead={t("auth.otp.noSms")} cta={t("auth.otp.editEmail")} onPress={editSignup} />
          ) : (
            <LinkLine testID="otp-edit-phone" top={F.v(8)} lead={t("auth.otp.noSms")} cta={t("auth.otp.editPhone")} onPress={() => router.replace("/login")} />
          )}

          {noAccount ? (
            <Glass style={s.card} testID="otp-no-account">
              <Text style={[s.cardT, { color: c.text }]}>{t("auth.otp.noAccountTitle")}</Text>
              <Text style={[s.cardP, { color: c.textMuted }]}>{t("auth.otp.noAccountBody")}</Text>
              <View style={s.cardBtn}>
                <GlassButton testID="otp-signup" label={t("auth.otp.noAccountCta")} onPress={() => router.replace(`/signup?phone=${encodeURIComponent(localThaiMobile(phone) ?? phone)}`)} />
              </View>
            </Glass>
          ) : null}

          {smsDown ? (
            <Glass style={s.card} testID="otp-sms-unavailable">
              <Text style={[s.cardP, { color: c.textMuted }]}>{t("auth.common.smsUnavailable")}</Text>
              <View style={s.cardBtn}>
                <GlassButton testID="otp-other-ways" label={t("auth.otp.otherWays")} onPress={() => router.replace("/login")} />
              </View>
            </Glass>
          ) : null}
        </ScrollView>
        <View style={s.foot}>
          <PrimaryButton
            testID="otp-submit"
            label={busy ? t("auth.common.verifying") : t("auth.common.verify")}
            onPress={() => void verify()}
            disabled={code.length !== 6 || busy || noAccount}
          />
        </View>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page + 2, paddingTop: F.v(14), paddingBottom: spacing.xl },
  foot: { paddingHorizontal: spacing.page + 4, paddingBottom: F.v(40), paddingTop: spacing.sm },
  b: { fontWeight: "600" },
  card: { marginTop: F.v(30) },
  cardT: { fontSize: type.h, fontWeight: "600", textAlign: "center" },
  cardP: { fontSize: type.sub, lineHeight: 21, textAlign: "center", marginTop: spacing.xs },
  cardBtn: { marginTop: spacing.md },
});
