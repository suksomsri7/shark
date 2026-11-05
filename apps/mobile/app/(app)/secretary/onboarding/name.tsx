// ตั้งชื่อเลขาครั้งแรก (ใบ S2.11 · แบบ C1 sec-c.jpg หน้า 3 + sec-dark-c.jpg หน้า 3) — เรียกครั้งแรกหลังสมัคร (S2.12) · ข้าม = ใช้ค่าปริยาย
//   ชื่อ (ค่าเริ่มต้น DEFAULT_SECRETARY_NAME · ไม่มีรายการชื่อให้เลือก R9) · ลงท้าย (ครับ/ค่ะ/ไม่ระบุ) · น้ำเสียง · ตัวอย่างการพูดสด (แม่แบบ i18n · ไม่ยิงเซิร์ฟเวอร์)
//   บันทึก ⇒ PUT secretary (updateSecretary · ระดับผู้ใช้) ⇒ โหลด secretary/me ใหม่ ⇒ ไปหน้าเลขา · ล้ม ⇒ ข้อความไทยของเซิร์ฟเวอร์ (ไม่ไปต่อ)
//   GET secretary: เคยตั้งแล้ว (saved) ⇒ เติมค่าเดิม
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, IconBtn, Note, Orb, PrimaryButton, Segment } from "@/src/components/airy";
import {
  DEFAULT_SECRETARY_NAME,
  SUFFIXES,
  TONES,
  loadSecretaryMe,
  secGet,
  serverNote,
  suffixKeyOf,
  suffixValueOf,
  updateSecretary,
  type SuffixKey,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T, cardGap } from "@/src/theme/tokens";

// S2.13 fix-forward (D1): ปุ่มหลักลอยล่าง — รายการเว้นล่าง = ความสูงปุ่ม + ระยะปุ่มจากขอบ + ช่องไฟการ์ด (+ safe area) แบบเดียวกับ A1 (S2.2)
const CTA_BOTTOM = 26;
const LIST_BOTTOM = size.btnH + CTA_BOTTOM + cardGap;

const NAME_MAX = 30;
/** ค่าเริ่มต้นของชื่อ = ชื่อระบบ (ไม่มีรายการชื่อตัวอย่างให้เลือก · R9) */
const DEFAULT_NAME: "Shark" = DEFAULT_SECRETARY_NAME;
const STEP = 3;
const STEPS = 3;

export default function SecretaryOnboardingNameScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [name, setName] = useState<string>(DEFAULT_NAME);
  const [suffix, setSuffix] = useState<SuffixKey>("khrap");
  const [tone, setTone] = useState<string>("polite");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const touched = useRef(false);

  // เคยตั้งแล้ว ⇒ เติมค่าเดิม (ยังไม่เคย = ค่าเริ่มต้น "Shark" · ครับ · สุภาพ)
  useEffect(() => {
    let live = true;
    secGet("secretary")
      .then((s) => {
        if (!live || touched.current || !s.saved) return;
        setName(s.name || DEFAULT_NAME);
        setSuffix(suffixKeyOf(s.suffix));
        if ((TONES as readonly string[]).includes(s.tone)) setTone(s.tone);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0 && Array.from(trimmed).length <= NAME_MAX;
  const shown = trimmed || DEFAULT_NAME;
  const first = user?.name?.trim().split(/\s+/)[0] ?? "";
  const s = suffixValueOf(suffix);
  const sample = t(tone === "friendly" ? "sec.onb.sample.friendly" : tone === "brief" ? "sec.onb.sample.brief" : "sec.onb.sample.polite", { name: shown, s, user: first });

  const done = () => router.replace("/secretary");
  const back = () => (router.canGoBack() ? router.back() : done());
  const edit = <K,>(fn: (v: K) => void) => (v: K) => {
    touched.current = true;
    fn(v);
  };

  const save = async () => {
    if (!nameOk || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      await updateSecretary({ name: trimmed, suffix: s, tone });
      void loadSecretaryMe(user?.id, true);
      router.replace("/secretary");
    } catch (e) {
      setErr(serverNote(e) ?? t("sec.onb.saveErr"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AiryScreen testID="sec-onb-name">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bar}>
          <IconBtn testID="sec-onb-back" icon="chevron-left" label={t("sec.room.back")} onPress={back} />
          <Text style={[styles.step, { color: c.text }]}>{t("sec.onb.step", { n: STEP, total: STEPS })}</Text>
          <Pressable testID="sec-onb-skip" accessibilityRole="button" onPress={done} hitSlop={8} style={styles.skip}>
            <Text style={[styles.skipT, { color: c.textMuted }]}>{t("sec.onb.skip")}</Text>
          </Pressable>
        </View>
        <View style={styles.progress}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i < STEP ? c.accent : c.btnOff.bg }]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={[styles.page, { paddingBottom: LIST_BOTTOM + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Orb size={Math.round(size.orbHero * 1.25)} testID="sec-onb-orb" />
            <Text style={[styles.h, { color: c.text }]}>{t("sec.onb.title")}</Text>
            <Text style={[styles.p, { color: c.textMuted }]}>{t("sec.onb.body")}</Text>
          </View>

          <TextInput
            testID="sec-onb-name-input"
            value={name}
            onChangeText={edit(setName)}
            maxLength={NAME_MAX + 10}
            placeholder={DEFAULT_NAME}
            placeholderTextColor={c.placeholder}
            accessibilityLabel={t("sec.onb.nameLabel")}
            style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
          />
          {!nameOk ? <Note warn testID="sec-onb-name-error">{t("sec.me.nameRule", { n: NAME_MAX })}</Note> : null}

          <Text style={[styles.label, { color: c.textDim }]}>{t("sec.me.suffix")}</Text>
          <Segment
            testID="sec-onb-suffix"
            value={suffix}
            onChange={edit((k: string) => setSuffix(k as SuffixKey))}
            options={SUFFIXES.map((x) => ({ key: x.key, label: t(x.key === "khrap" ? "sec.me.suffix.khrap" : x.key === "kha" ? "sec.me.suffix.kha" : "sec.me.suffix.none") }))}
          />

          <Text style={[styles.label, { color: c.textDim }]}>{t("sec.me.tone")}</Text>
          <Segment
            testID="sec-onb-tone"
            value={tone}
            onChange={edit(setTone)}
            options={TONES.map((k) => ({ key: k, label: t(k === "friendly" ? "sec.me.tone.friendly" : k === "brief" ? "sec.me.tone.brief" : "sec.me.tone.polite") }))}
          />

          <Glass testID="sec-onb-preview" radius={radii.sugg} style={styles.sample}>
            <Text style={[styles.sampleL, { color: c.zone.team }]}>{t("sec.me.sampleLabel")}</Text>
            <Text style={[styles.sampleT, { color: c.text }]}>{sample}</Text>
          </Glass>
          {err ? (
            <Note warn testID="sec-onb-err">
              {err}
            </Note>
          ) : null}
        </ScrollView>

        <View style={[styles.cta, { bottom: CTA_BOTTOM + insets.bottom }]}>
          <PrimaryButton testID="sec-onb-save" label={busy ? t("sec.set.saving") : t("sec.onb.start", { name: shown })} disabled={!nameOk || busy} onPress={() => void save()} />
        </View>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.page, paddingTop: 14 },
  step: { flex: 1, textAlign: "center", fontSize: T.sub, fontWeight: "600" },
  skip: { width: size.iconBtn, height: size.iconBtn, alignItems: "flex-end", justifyContent: "center" },
  skipT: { fontSize: T.sub - 0.5 },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.page, marginTop: 8 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
  page: { paddingHorizontal: spacing.page },
  hero: { alignItems: "center", marginTop: F.v(44) },
  h: { fontSize: T.lt, fontWeight: "700", lineHeight: 32, marginTop: F.v(26), textAlign: "center" },
  p: { fontSize: T.sub - 0.5, lineHeight: 20, marginTop: 6, textAlign: "center" },
  input: { height: 56, borderRadius: radii.sugg, borderWidth: 1, paddingHorizontal: 16, fontSize: T.h + 2, fontWeight: "700", textAlign: "center", marginTop: F.v(36), outlineWidth: 0 },
  label: { fontSize: T.cap, marginTop: F.v(30), marginBottom: 6, marginLeft: 2 },
  sample: { marginTop: F.v(30) },
  sampleL: { fontSize: T.cap - 0.5, fontWeight: "600" },
  sampleT: { fontSize: T.sub + 0.5, lineHeight: 22, marginTop: 4 },
  cta: { position: "absolute", left: spacing.page, right: spacing.page },
});
