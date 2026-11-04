// คุยกับลูกค้าแทนร้าน (ใบ S2.9 · แบบ B7 sec-b.jpg หน้า 7) — GET/PUT secretary/after-hours (OWNER เท่านั้นทั้งอ่านและตั้ง)
//   2 สวิตช์: reply (นอกเวลาทำการให้ Shark ตอบ) · handoff (ส่งต่อคนเมื่อไม่แน่ใจ) + ข้อความแจ้งลูกค้าว่าเป็น AI (disclosure)
//   disclosure ตรวจในแอปก่อนส่ง (กติกาเดียวกับเซิร์ฟเวอร์ R-S1.22d: ห้ามว่าง · ≤ 200 ตัว · ต้องมีคำ AI/เอไอ/ผู้ช่วย) — ไม่ผ่าน = ไม่ยิง PUT
//   ตัวอย่างข้อความ = คำนำหน้าคงที่ของเซิร์ฟเวอร์ + คำตอบตัวอย่าง + disclosure ที่กำลังแก้
//   บทบาทอื่น: ไม่ยิง GET (เซิร์ฟเวอร์ตอบ 403) — แสดงป้าย "เจ้าของเท่านั้น" + ข้อมูล PDPA
//   "เวลาทำการ" ตั้งบนเว็บ (หน้าแชทของร้าน) → เปิดหน้าแรก 1.0 (WebView) ด้วย ?open=/app/
import { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, Note, PrimaryButton, SectionLabel } from "@/src/components/airy";
import { OwnerOnlyBadge, SettingRow, SettingsTop, Toggle } from "@/src/components/secretary/SettingRow";
import { DISCLOSURE_MAX, disclosureProblem, secGet, secPut, serverNote, useActiveRole, type AfterHours } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const PROBLEM = { empty: "sec.cust.err.empty", noAi: "sec.cust.err.noAi", long: "sec.cust.err.long" } as const;
const same = (a: AfterHours | null, b: AfterHours | null) => !!a && !!b && a.reply === b.reply && a.handoff === b.handoff && a.disclosure.trim() === b.disclosure.trim();

export default function SecretaryCustomersScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const role = useActiveRole();
  const owner = role === "OWNER";
  const { tenants, activeTenantId } = useAuth();
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const [saved, setSaved] = useState<AfterHours | null>(null);
  const [form, setForm] = useState<AfterHours | null>(null);
  const [problem, setProblem] = useState<keyof typeof PROBLEM | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId || !owner) return;
      let live = true;
      secGet("secretary/after-hours")
        .then((r) => {
          if (!live) return;
          setSaved(r);
          setForm(r);
        })
        .catch((e) => live && setNote({ text: serverNote(e) ?? t("sec.set.loadFail"), warn: true }));
      return () => {
        live = false;
      };
    }, [activeTenantId, owner, t]),
  );

  const dirty = !!form && !same(form, saved);
  const set = (patch: Partial<AfterHours>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setNote(null);
    if (patch.disclosure !== undefined) setProblem(null);
  };

  const save = async () => {
    if (!form || !dirty || busy) return;
    const p = disclosureProblem(form.disclosure);
    if (p) {
      setProblem(p);
      return;
    }
    const tenant = activeTenantId;
    setBusy(true);
    setNote(null);
    try {
      const r = await secPut("secretary/after-hours", { reply: form.reply, handoff: form.handoff, disclosure: form.disclosure.trim() });
      if (tenantRef.current !== tenant) return;
      setSaved(r);
      setForm(r);
      setNote({ text: t("sec.set.savedShort"), warn: false });
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("sec.set.saveFail"), warn: true });
    } finally {
      setBusy(false);
    }
  };

  const openHours = () => router.push({ pathname: "/", params: { open: "/app/", t: String(Date.now()) } });

  return (
    <AiryScreen testID="sec-cust">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SettingsTop testID="sec-cust-top" title={t("sec.title.settingsCustomers")} subtitle={tenantName} />
        {!owner ? (
          <>
            <OwnerOnlyBadge />
            <Text testID="sec-cust-owner" style={[styles.intro, { color: c.textMuted }]}>
              {t("sec.cust.ownerOnly")}
            </Text>
          </>
        ) : null}
        {note ? (
          <Note warn={note.warn} testID="sec-cust-note">
            {note.text}
          </Note>
        ) : null}

        {owner && form ? (
          <>
            <Glass radius={radii.sugg} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.body}>
                  <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.reply.title")}</Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.reply.sub")}</Text>
                </View>
                <Toggle testID="sec-cust-afterhours" value={form.reply} onChange={(v) => set({ reply: v })} label={t("sec.cust.reply.title")} />
              </View>
            </Glass>

            <Glass radius={radii.sugg} style={styles.card}>
              <Text style={[styles.sampleL, { color: c.sys.dorm }]}>{t("sec.cust.sampleLabel")}</Text>
              <Text testID="sec-cust-sample" style={[styles.sampleT, { color: c.text }]}>
                {t("sec.cust.prefix")}
                {t("sec.cust.sampleAnswer", { shop: tenantName })}
                {"\n"}
                {form.disclosure.trim()}
              </Text>
            </Glass>

            <Glass radius={radii.sugg} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.body}>
                  <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.handoff.title")}</Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.handoff.sub")}</Text>
                </View>
                <Toggle testID="sec-cust-handoff" value={form.handoff} onChange={(v) => set({ handoff: v })} label={t("sec.cust.handoff.title")} />
              </View>
            </Glass>

            <Glass radius={radii.sugg} style={styles.card}>
              <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.disclosure.title")}</Text>
              <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.disclosure.sub")}</Text>
              <TextInput
                testID="sec-cust-disclosure"
                value={form.disclosure}
                onChangeText={(v) => set({ disclosure: v })}
                multiline
                maxLength={DISCLOSURE_MAX + 50}
                placeholderTextColor={c.placeholder}
                style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: problem ? c.warn.fg : c.glass.border }]}
              />
              {problem ? (
                <Text testID="sec-cust-disclosure-error" style={[styles.err, { color: c.warn.fg }]}>
                  {t(PROBLEM[problem], { n: DISCLOSURE_MAX })}
                </Text>
              ) : null}
            </Glass>

            <View style={styles.save}>
              <PrimaryButton testID="sec-cust-save" label={busy ? t("sec.set.saving") : t("sec.set.save")} disabled={!dirty || busy} onPress={() => void save()} />
            </View>
            <SettingRow testID="sec-cust-hours" icon="clock" title={t("sec.cust.hours.title")} sub={t("sec.cust.hours.sub")} onPress={openHours} />
          </>
        ) : null}

        <SectionLabel style={styles.label}>{t("sec.cust.pdpaLabel")}</SectionLabel>
        <Glass radius={radii.sugg} style={styles.card}>
          <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.pdpa1.title")}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.pdpa1.body")}</Text>
        </Glass>
        <Glass radius={radii.sugg} style={styles.card}>
          <Text style={[styles.title, { color: c.text }]}>{t("sec.cust.pdpa2.title")}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.cust.pdpa2.body")}</Text>
        </Glass>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  intro: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: spacing.md },
  card: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { flex: 1 },
  title: { fontSize: T.sub + 1.5, fontWeight: "700", lineHeight: 22 },
  sub: { fontSize: T.cap, lineHeight: 18, marginTop: 3 },
  sampleL: { fontSize: T.cap - 1, fontWeight: "700" },
  sampleT: { fontSize: T.sub + 0.5, lineHeight: 23, marginTop: 6 },
  input: { minHeight: 70, borderRadius: radii.segIn + 2, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.sub, lineHeight: 20, marginTop: 10, textAlignVertical: "top" },
  err: { fontSize: T.cap, lineHeight: 18, marginTop: 6 },
  save: { marginTop: spacing.lg, marginBottom: 4 },
  label: { marginTop: F.v(36), marginLeft: F.v(10), fontSize: T.cap, lineHeight: 17, letterSpacing: 0.8 },
});
