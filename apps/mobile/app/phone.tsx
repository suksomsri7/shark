// R8 · บัญชีเดิมที่ยังไม่มีเบอร์ต้องผูกเบอร์ก่อนใช้งาน (ใบ S2.12) — ยามหน้าประตู (app/_layout.tsx) พามาเมื่อ /me ตอบ user.phone = null
// ขั้น 1 ใส่เบอร์ → รับรหัส SMS · ขั้น 2 รหัส 6 ช่องในหน้าเดียว → POST /api/mobile/auth/phone/link (Bearer) → refreshMe ⇒ ยามพาไปต่อเอง
// ทางออกจากจอนี้มีทางเดียวคือออกจากระบบ (มติ R8 — ไม่มีปุ่มให้ผ่านไปโดยไม่ผูกเบอร์)
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { AiryScreen, Orb, PrimaryButton } from "@/src/components/airy";
import { AuthField, GlassButton, Hero, LinkLine, NoteLine, OtpBoxes } from "@/src/components/auth/airy";
import { authErrorCode, authErrorKey, keepCodeOnError, phoneLink, smsRequest } from "@/src/lib/auth-api";
import { formatThaiMobileInput, maskPhone, normalizeThaiMobile } from "@/src/lib/phone";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F } from "@/src/theme/index";
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
  // R-Z30: กล่องรหัสส่งเองเมื่อครบ + กดปุ่มซ้ำในรอบเดียวกัน — state อัปเดตไม่ทัน ⇒ กันด้วย ref
  const busyRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [linked, setLinked] = useState(false); // ผูกสำเร็จแล้วแต่โหลด /me ไม่ได้ ⇒ ปุ่มลองใหม่ (ไม่ผูกซ้ำ · รหัสถูกใช้แล้ว)

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
    if (!phoneOk || busy || busyRef.current) {
      if (!phoneOk) setErr(t("auth.common.badPhone"));
      return;
    }
    busyRef.current = true;
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
      busyRef.current = false;
      setBusy(false);
    }
  }

  // /me ได้เบอร์แล้ว ⇒ ยามหน้าประตูพาไปหน้าถัดไปเอง · โหลดไม่ได้ ⇒ คงจอไว้พร้อมปุ่มลองใหม่
  async function reload() {
    if (busyRef.current) return;
    busyRef.current = true;
    setErr(null);
    setBusy(true);
    try {
      if (!(await refreshMe())) setErr(t("auth.phone.reloadFailed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function link(value = code) {
    if (value.length !== 6 || busy || busyRef.current) return;
    busyRef.current = true;
    setErr(null);
    setBusy(true);
    let ok = false;
    try {
      await phoneLink(phone, value);
      ok = true;
    } catch (e) {
      const why = authErrorCode(e);
      setErr(reason(e));
      if (why === "invalid") setShakeKey((k) => k + 1);
      // หมดอายุ/ไม่พบ ⇒ ส่งใหม่ได้ทันที · ล็อก ⇒ ตัวนับเดินต่อ (§R)
      if (why === "expired" || why === "not_found") setLeft(0);
      // S2.14 (R-S2.14i): ล้มชั่วคราว (เน็ต · ≥500 ยกเว้น 503) ⇒ คงรหัสไว้กด "ยืนยัน" ซ้ำ · รหัสผิด/หมดอายุ ⇒ ล้างให้พิมพ์ใหม่
      if (!keepCodeOnError(e)) setCode("");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (ok) {
      setLinked(true);
      await reload();
    }
  }

  return (
    <AiryScreen testID="phone">
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Hero top={F.v(88)} orb={<Orb size={64} />} title={t("auth.phone.title")}>
            {step === "phone" ? t("auth.phone.sub") : t("auth.phone.codeSent", { phone: maskPhone(phone) })}
          </Hero>

          {step === "phone" ? (
            <AuthField
              testID="phone-input"
              top={F.v(26)}
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
              <OtpBoxes testID="phone-otp" top={F.v(30)} value={code} onChange={setCode} onFilled={(v) => void link(v)} shakeKey={shakeKey} editable={!busy} />
              <LinkLine
                testID="phone-resend"
                top={F.v(26)}
                lead={left > 0 ? t("auth.otp.resendIn", { time: clock(left) }) : undefined}
                cta={left > 0 ? "" : t("auth.otp.resend")}
                disabled={left > 0 || busy}
                onPress={() => void request()}
              />
              <LinkLine testID="phone-change" top={F.v(8)} cta={t("auth.phone.changePhone")} onPress={() => { setStep("phone"); setCode(""); setErr(null); }} />
            </>
          )}

          {err ? <NoteLine tone="error" top={F.v(20)}>{err}</NoteLine> : null}
        </ScrollView>
        <View style={s.foot}>
          {linked ? (
            <PrimaryButton testID="phone-retry" label={busy ? t("auth.common.verifying") : t("auth.phone.retry")} onPress={() => void reload()} disabled={busy} />
          ) : step === "phone" ? (
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
  page: { paddingHorizontal: spacing.page + 2, paddingTop: F.v(14), paddingBottom: spacing.xl },
  foot: { paddingHorizontal: spacing.page + 4, paddingBottom: F.v(30), paddingTop: spacing.sm },
  gap: { height: spacing.md },
});
