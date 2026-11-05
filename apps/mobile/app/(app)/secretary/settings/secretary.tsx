// เลขาของฉัน (ใบ S2.7 · แบบ B2 sec-b.jpg หน้า 2) — ตัวตนเลขาระดับผู้ใช้ (ตามไปทุกกิจการ)
//   GET/PUT secretary: ชื่อ · น้ำเสียง (polite/friendly/brief) · คำลงท้าย (ครับ/ค่ะ/ไม่ระบุ) · ภาษา (ตัวแรก = ภาษาหลัก)
//   ตัวอย่างการพูดสด = แม่แบบ i18n จากชื่อ/ลงท้าย/น้ำเสียงที่กำลังแก้ (ไม่ยิงเซิร์ฟเวอร์)
//   สถิติ 4 ช่อง (ไม่มีเส้น stats ใน S1.14): งานเดือนนี้ + % โควตา (secretary/quota) · รออนุมัติ (secretary/inbox/count) · เสร็จ 7 วัน (secretary/rooms)
//   บันทึกแล้ว ⇒ โหลด secretary/me ใหม่ (ภาษาจอเลขาเปลี่ยนตาม languages[0]) · ท้ายหน้า = แถวไปหน้าตั้งค่าอื่น (ตามแบบ)
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, LoadError, Loading, Note, Orb, PrimaryButton, Segment } from "@/src/components/airy";
import { SettingRow, SettingsTop } from "@/src/components/secretary/SettingRow";
import {
  DEFAULT_SECRETARY_NAME,
  SEC_LANGUAGES,
  SUFFIXES,
  TONES,
  isDenied,
  loadSecretaryMe,
  normStatus,
  quotaNumbers,
  secGet,
  secPut,
  serverNote,
  suffixKeyOf,
  suffixValueOf,
  type SecretaryIdentity,
  type SuffixKey,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

type Form = { name: string; tone: string; suffix: SuffixKey; languages: string[] };
type Stats = { jobs: number | null; pct: number | null; waiting: number | null; done7: number | null };
const WEEK_MS = 7 * 86_400_000;
const NAME_MAX = 30;

const formOf = (s: SecretaryIdentity | null): Form => ({
  name: s?.name ?? DEFAULT_SECRETARY_NAME,
  tone: s?.tone && (TONES as readonly string[]).includes(s.tone) ? s.tone : "polite",
  suffix: suffixKeyOf(s?.suffix),
  languages: s?.languages?.length ? [...s.languages] : ["th"],
});
const same = (a: Form, b: Form) => a.name.trim() === b.name.trim() && a.tone === b.tone && a.suffix === b.suffix && a.languages.join(",") === b.languages.join(",");

const LINKS: { key: string; title: I18nKey; path: Href }[] = [
  { key: "access", title: "sec.title.settingsAccess", path: "/secretary/settings/access" },
  { key: "rules", title: "sec.title.settingsRules", path: "/secretary/settings/rules" },
  { key: "knowledge", title: "sec.title.settingsKnowledge", path: "/secretary/settings/knowledge" },
  { key: "quota", title: "sec.title.settingsQuota", path: "/secretary/settings/quota" },
];

export default function SecretaryProfileScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { user, activeTenantId } = useAuth();
  const [saved, setSaved] = useState<Form>(formOf(null));
  const [form, setForm] = useState<Form>(formOf(null));
  const [stats, setStats] = useState<Stats>({ jobs: null, pct: null, waiting: null, done7: null });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  // R-S2.14h: ก่อนได้ตัวตนเลขา = Loading (ไม่วางชื่อ/น้ำเสียงค่าปริยายให้แก้) · ล้ม = LoadError+ลองใหม่ (403 = การ์ดล็อก)
  const [ident, setIdent] = useState<"loading" | "ok" | "error" | "denied">("loading");
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      secGet("secretary")
        .then((s) => {
          if (!live) return;
          const f = formOf(s);
          setSaved(f);
          setForm(f);
          setIdent("ok");
        })
        .catch((e) => {
          if (!live) return;
          setIdent((cur) => (cur === "ok" ? cur : isDenied(e) ? "denied" : "error"));
        });
      if (activeTenantId) {
        const now = Date.now();
        void Promise.all([
          secGet("secretary/quota").catch(() => null),
          secGet("secretary/inbox/count").catch(() => null),
          secGet("secretary/rooms", { take: 50 }).catch(() => null),
        ]).then(([q, inbox, rooms]) => {
          if (!live) return;
          const qn = q ? quotaNumbers(q) : null;
          const done7 = rooms ? (rooms.items ?? []).filter((r) => normStatus(r.status) === "DONE" && now - Date.parse(r.updatedAt ?? "") <= WEEK_MS).length : null;
          setStats({ jobs: qn?.used ?? null, pct: qn?.pct ?? null, waiting: inbox?.total ?? null, done7 });
        });
      }
      return () => {
        live = false;
      };
    }, [activeTenantId, tick]),
  );
  const retryIdent = useCallback(() => {
    setIdent("loading");
    setTick((x) => x + 1);
  }, []);

  const dirty = !same(form, saved);
  const nameOk = form.name.trim().length > 0 && Array.from(form.name.trim()).length <= NAME_MAX;
  const suffixValue = suffixValueOf(form.suffix);
  const sample = t(form.tone === "friendly" ? "sec.me.sample.friendly" : form.tone === "brief" ? "sec.me.sample.brief" : "sec.me.sample.polite", {
    name: form.name.trim() || DEFAULT_SECRETARY_NAME,
    s: suffixValue,
  });

  const toggleLang = (l: string) =>
    setForm((f) => {
      const has = f.languages.includes(l);
      if (has && f.languages.length === 1) return f; // ต้องมีอย่างน้อย 1 ภาษา
      return { ...f, languages: has ? f.languages.filter((x) => x !== l) : [...f.languages, l] };
    });

  const save = async () => {
    if (!dirty || !nameOk || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await secPut("secretary", { name: form.name.trim(), suffix: suffixValue, tone: form.tone, languages: form.languages });
      const f = formOf(r);
      setSaved(f);
      setForm(f);
      setNote({ text: t("sec.me.saved"), warn: false });
      void loadSecretaryMe(user?.id, true);
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("sec.set.saveFail"), warn: true });
    } finally {
      setBusy(false);
    }
  };

  const first = user?.name?.trim().split(/\s+/)[0] ?? "";
  const tiles = useMemo(
    () => [
      { key: "jobs", v: stats.jobs === null ? "–" : String(stats.jobs), label: t("sec.me.stat.jobs") },
      { key: "quota", v: stats.pct === null ? "–" : t("sec.set.pct", { n: stats.pct }), label: t("sec.me.stat.quota") },
      { key: "waiting", v: stats.waiting === null ? "–" : String(stats.waiting), label: t("sec.me.stat.waiting") },
      { key: "done7", v: stats.done7 === null ? "–" : String(stats.done7), label: t("sec.me.stat.done7") },
    ],
    [stats, t],
  );

  return (
    <AiryScreen testID="sec-me">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-me-top" />
        <View style={styles.hero}>
          <Orb size={size.orbHero} testID="sec-me-orb" />
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
            {ident === "ok" ? saved.name : "\u00a0"}
          </Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>{first ? t("sec.me.subUser", { user: first }) : t("sec.me.sub")}</Text>
        </View>

        <View testID="sec-me-stat" style={styles.grid}>
          {tiles.map((x) => (
            <Glass key={x.key} testID={`sec-me-stat-${x.key}`} radius={radii.sugg} style={styles.tile}>
              <Text style={[styles.tileV, { color: c.text }]}>{x.v}</Text>
              <Text style={[styles.tileL, { color: c.textMuted }]}>{x.label}</Text>
            </Glass>
          ))}
        </View>

        {ident === "loading" ? (
          <Loading testID="sec-me-loading" />
        ) : ident !== "ok" ? (
          <LoadError testID="sec-me-error" denied={ident === "denied"} onRetry={retryIdent} />
        ) : (
          <>
            <Text style={[styles.label, { color: c.textDim }]}>{t("sec.me.name")}</Text>
            <TextInput
              testID="sec-me-name"
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              maxLength={NAME_MAX + 10}
              placeholder={DEFAULT_SECRETARY_NAME}
              placeholderTextColor={c.placeholder}
              style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
            />
            {!nameOk ? <Note warn testID="sec-me-name-error">{t("sec.me.nameRule", { n: NAME_MAX })}</Note> : null}

            <Text style={[styles.label, { color: c.textDim }]}>{t("sec.me.tone")}</Text>
            <Segment
              testID="sec-me-tone"
              value={form.tone}
              onChange={(k) => setForm((f) => ({ ...f, tone: k }))}
              options={TONES.map((k) => ({ key: k, label: t(k === "friendly" ? "sec.me.tone.friendly" : k === "brief" ? "sec.me.tone.brief" : "sec.me.tone.polite") }))}
            />

            <Text style={[styles.label, { color: c.textDim }]}>{t("sec.me.suffix")}</Text>
            <Segment
              testID="sec-me-suffix"
              value={form.suffix}
              onChange={(k) => setForm((f) => ({ ...f, suffix: k as SuffixKey }))}
              options={SUFFIXES.map((s) => ({ key: s.key, label: t(s.key === "khrap" ? "sec.me.suffix.khrap" : s.key === "kha" ? "sec.me.suffix.kha" : "sec.me.suffix.none") }))}
            />

            <Text style={[styles.label, { color: c.textDim }]}>{t("sec.me.lang")}</Text>
            <View testID="sec-me-lang" style={styles.chips}>
              {SEC_LANGUAGES.map((l) => (
                <Chip key={l} testID={`sec-me-lang-${l}`} active={form.languages.includes(l)} label={t(l === "en" ? "sec.me.lang.en" : l === "zh" ? "sec.me.lang.zh" : l === "ja" ? "sec.me.lang.ja" : "sec.me.lang.th")} onPress={() => toggleLang(l)} />
              ))}
            </View>
            <Text style={[styles.hint, { color: c.textMuted }]}>{t("sec.me.langHint")}</Text>

            <Glass testID="sec-me-sample" radius={radii.sugg} style={styles.sample}>
              <Text style={[styles.sampleL, { color: c.textMuted }]}>{t("sec.me.sampleLabel")}</Text>
              <Text style={[styles.sampleT, { color: c.text }]}>{sample}</Text>
            </Glass>

            {note ? (
              <Note warn={note.warn} testID="sec-me-note">
                {note.text}
              </Note>
            ) : null}
            <View style={styles.save}>
              <PrimaryButton testID="sec-me-save" label={busy ? t("sec.set.saving") : t("sec.set.save")} disabled={!dirty || !nameOk || busy} onPress={() => void save()} />
            </View>
          </>
        )}

        <View style={styles.links}>
          {LINKS.map((l) => (
            <SettingRow key={l.key} testID={`sec-me-link-${l.key}`} title={t(l.title)} onPress={() => router.push(l.path)} />
          ))}
        </View>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", marginTop: F.v(4) },
  name: { fontSize: T.lt, fontWeight: "700", marginTop: 10, lineHeight: 32 },
  heroSub: { fontSize: T.sub - 0.5, marginTop: 4, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: F.v(22) },
  tile: { width: "48%", flexGrow: 1, minHeight: 74 },
  tileV: { fontSize: 24, fontWeight: "700", lineHeight: 30 },
  tileL: { fontSize: T.cap - 0.5, marginTop: 2 },
  label: { fontSize: T.cap, marginTop: F.v(26), marginBottom: 6, marginLeft: 2 },
  input: { height: 46, borderRadius: radii.segIn + 4, borderWidth: 1, paddingHorizontal: 14, fontSize: T.body, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  hint: { fontSize: T.cap - 0.5, marginTop: 6, marginLeft: 2 },
  sample: { marginTop: F.v(26) },
  sampleL: { fontSize: T.cap - 0.5, fontWeight: "600" },
  sampleT: { fontSize: T.sub + 0.5, lineHeight: 22, marginTop: 4 },
  save: { marginTop: spacing.lg },
  links: { marginTop: spacing.lg },
});
