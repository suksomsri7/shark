// เริ่มงานใหม่ (ใบ S2.3 · แบบ A2 sec-a.jpg หน้า 2)
//   ทักทายด้วยชื่อ/คำลงท้ายของเลขา (secretary/me) · ข้อเสนอจาก secretary/suggestions (แตะ = เติมคำสั่งลงช่อง ไม่ส่งเอง · มติ 9)
//   "งานที่สั่งบ่อย" จาก secretary/frequent (แตะ = เติม) · "ระบบที่เลขาเข้าถึงได้" จาก secretary/access (ไม่โชว์ระบบที่ปิด)
//   ส่ง = POST secretary/rooms { instruction, clientMessageId } → แทนที่จอด้วย /secretary/room/<roomId>
//   402 / quota ⇒ การ์ด "โควตางานเดือนนี้หมด" + ลิงก์ /secretary/settings/quota · 429 / 403 / อื่น ๆ ⇒ ข้อความสั้นใต้ข้อเสนอ
//   ช่องพิมพ์ล่างสุด InputBar (ไม่มีปุ่มเสียง · มติ 16) · ปุ่มส่งกดไม่ได้เมื่อว่างหรือกำลังส่ง · ?q= เติมคำสั่งมาจาก C3
// ทุกเส้นผ่าน src/api/secretary.ts · ข้อความผ่าน i18n · สเกล R-UI1 (F.v = แบบ × 0.73 · ตัวอักษรตาม tokens.type)
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, IconBtn, InputBar, Note, Orb, SectionLabel, SysTag, TopBar } from "@/src/components/airy";
import { SuggestionList } from "@/src/components/secretary/SuggestionList";
import { sysName } from "@/src/components/secretary/RoomCard";
import { sysColor } from "@/src/components/secretary/sys";
import {
  DEFAULT_SECRETARY_NAME,
  clientMessageId,
  normalizeFrequent,
  normalizeSuggestions,
  secGet,
  secPost,
  startErrorKind,
  useSecretaryMe,
  type AccessItem,
  type Frequent,
  type Suggestion,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { size, spacing, type as T } from "@/src/theme/tokens";

const INPUT_BOTTOM = 26;
type ErrKind = "quota" | "rate" | "denied" | "other";
const ERR_KEY = { rate: "sec.new.err.rate", denied: "sec.new.err.denied", other: "sec.new.err.other" } as const;

export default function SecretaryNewScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const { activeTenantId, tenants, user } = useAuth();
  const sec = useSecretaryMe();
  const name = sec?.name ?? DEFAULT_SECRETARY_NAME;
  const suffix = sec?.suffix ?? "";
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");

  const [text, setText] = useState(typeof params.q === "string" ? params.q : "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [frequent, setFrequent] = useState<Frequent[]>([]);
  const [systems, setSystems] = useState<AccessItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErrKind | null>(null);
  const tenantRef = useRef(activeTenantId);

  useEffect(() => {
    tenantRef.current = activeTenantId;
  }, [activeTenantId]);

  useEffect(() => {
    if (typeof params.q === "string" && params.q) setText(params.q);
  }, [params.q]);

  const load = useCallback(() => {
    const tenant = activeTenantId;
    if (!tenant) return;
    const live = () => tenantRef.current === tenant;
    const sugg = secGet("secretary/suggestions").catch(() => null);
    void sugg.then((r) => live() && setSuggestions(normalizeSuggestions(r)));
    // สั่งบ่อย: เส้นของตัวเอง · ไม่มี/ว่าง ⇒ ใช้ `frequent` ที่แนบมากับ suggestions (ร่าง API)
    void Promise.all([secGet("secretary/frequent").catch(() => null), sugg]).then(([f, s]) => {
      if (!live()) return;
      const own = normalizeFrequent(f);
      setFrequent((own.length > 0 ? own : normalizeFrequent(s, "frequent")).slice(0, 8));
    });
    void secGet("secretary/access")
      .then((r) => live() && setSystems((r.items ?? []).filter((x) => x.level !== "OFF")))
      .catch(() => live() && setSystems([]));
  }, [activeTenantId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const fill = (instruction: string) => {
    setText(instruction);
    setErr(null);
  };

  const send = async () => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await secPost("secretary/rooms", { instruction, clientMessageId: clientMessageId() });
      router.replace(`/secretary/room/${r.roomId}`);
    } catch (e) {
      setErr(startErrorKind(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace("/secretary"));
  // ชื่อผู้ใช้คำแรก (เช่น "คุณสุข") ให้คำทักสั้นพอบรรทัดเดียว
  const first = user?.name?.trim().split(/\s+/)[0] ?? "";
  const greet = first ? t("sec.new.greetUser", { suffix, user: first, name }) : t("sec.new.greet", { suffix, name });

  return (
    <AiryScreen testID="sec-new">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bar}>
          <TopBar
            testID="sec-new-top"
            left={<IconBtn testID="sec-new-close" icon="x" label={t("sec.new.close")} onPress={close} />}
            title={t("sec.title.new")}
            subtitle={tenantName}
            right={<View style={styles.spacer} />}
          />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hello}>
            <Orb size={size.orb + 4} testID="sec-new-orb" />
            <View style={styles.helloX}>
              <Text style={[styles.greet, { color: c.text }]}>{greet}</Text>
              <Text style={[styles.hint, { color: c.textMuted }]}>{t("sec.new.hint")}</Text>
            </View>
          </View>

          {err === "quota" ? (
            <Glass testID="sec-new-quota" style={styles.quota}>
              <Text style={[styles.quotaT, { color: c.text }]}>{t("sec.new.quota.title")}</Text>
              <Text style={[styles.quotaB, { color: c.textMuted }]}>{t("sec.new.quota.body")}</Text>
              <Pressable testID="sec-new-quota-link" accessibilityRole="link" onPress={() => router.push("/secretary/settings/quota")} style={styles.quotaLink}>
                <Text style={[styles.quotaL, { color: c.text }]}>{t("sec.new.quota.link")}</Text>
              </Pressable>
            </Glass>
          ) : err ? (
            <Note warn testID="sec-new-error">
              {t(ERR_KEY[err])}
            </Note>
          ) : null}

          {suggestions.length > 0 ? (
            <>
              <SectionLabel style={styles.label}>{t("sec.new.suggestLabel", { name })}</SectionLabel>
              <SuggestionList testID="sec-new-suggestion" items={suggestions.slice(0, 4)} onPick={(s) => fill(s.instruction)} />
            </>
          ) : null}

          {frequent.length > 0 ? (
            <>
              <SectionLabel style={styles.label}>{t("sec.new.frequentLabel")}</SectionLabel>
              <View testID="sec-new-frequent" style={styles.wrap}>
                {frequent.map((f, i) => (
                  <Chip key={`${i}-${f.instruction}`} testID={`sec-new-frequent-${i}`} label={f.title.length > 28 ? `${f.title.slice(0, 27)}…` : f.title} onPress={() => fill(f.instruction)} />
                ))}
              </View>
            </>
          ) : null}

          {systems.length > 0 ? (
            <>
              <SectionLabel style={styles.label}>{t("sec.new.systemLabel", { name })}</SectionLabel>
              <View testID="sec-new-system" style={[styles.wrap, styles.tags]}>
                {systems.map((s) => (
                  <SysTag
                    key={s.module}
                    sys={sysColor(s.module)}
                    label={s.level === "READ" ? t("sec.new.readOnly", { sys: sysName(t, s.module) }) : sysName(t, s.module)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        <InputBar
          testID="sec-new-input"
          sendTestID="sec-new-send"
          placeholder={t("sec.new.input")}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (err && err !== "quota") setErr(null);
          }}
          onSend={() => void send()}
          onPlus={() => fill("")}
          sendDisabled={!text.trim() || busy}
          style={styles.input}
        />
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { paddingHorizontal: spacing.page, paddingTop: 14 },
  spacer: { width: size.iconBtn },
  page: { paddingHorizontal: spacing.page, paddingBottom: spacing.xl },
  hello: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: F.v(27) },
  helloX: { flex: 1, minWidth: 0 },
  greet: { fontSize: T.body, fontWeight: "700", lineHeight: 22 },
  hint: { fontSize: T.cap, lineHeight: 18, marginTop: 2 },
  label: { marginTop: F.v(36), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: F.v(16) },
  tags: { gap: 6 },
  quota: { marginTop: F.v(24) },
  quotaT: { fontSize: T.h, fontWeight: "700", lineHeight: 24 },
  quotaB: { fontSize: T.sub, lineHeight: 20, marginTop: spacing.xs },
  quotaLink: { marginTop: spacing.sm, alignSelf: "flex-start", paddingVertical: spacing.xs },
  quotaL: { fontSize: T.sub, fontWeight: "700", textDecorationLine: "underline" },
  input: { marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM },
});
