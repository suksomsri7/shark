// เพิ่มคนด้วยเบอร์โทร (B27 · แบบ /root/mockups/team-invite/team2.png จอ 2) — แทนจอเชิญทาง SMS เดิม (staff/invite.tsx · ถอดแล้ว)
//   พิมพ์เบอร์ครบ 10 หลัก ⇒ POST secretary/team/lookup (ผู้ใช้ Lekaa ที่ยืนยันเบอร์แล้วเท่านั้น · คืนแค่ชื่อแสดง)
//     เจอ = การ์ดชื่อ + "✓ ใช้ Lekaa อยู่แล้ว" → ปุ่ม "เพิ่มเข้าทีม" (POST secretary/team/members · คุยอย่างเดียว · อีกฝ่ายต้องกดยอมรับในแอป)
//     ไม่เจอ = "เบอร์นี้ยังไม่มี Lekaa …" + ปุ่ม "ส่งลิงก์ดาวน์โหลดแอป" (แผ่นแชร์ของเครื่อง · Share ของ react-native · ไม่สร้างบัญชี/ไม่ส่ง SMS)
//   "เลือกจากรายชื่อในเครื่อง" (แบบ) — ยังไม่มีโมดูล expo-contacts ในแอป ⇒ ไม่แสดง (เพิ่มโมดูล native ต้อง build ใหม่ · รอผู้คุมตัดสิน)
//   OWNER/MANAGER เท่านั้น (เซิร์ฟเวอร์ 403 ⇒ ข้อความ) · ข้อความผ่าน i18n (team.add.*)
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, IconBtn, Note, PrimaryButton, TopBar } from "@/src/components/airy";
import { Avatar } from "@/src/components/secretary/MemberBubble";
import { ApiError } from "@/src/api/client";
import { serverNote } from "@/src/api/secretary";
import { addToTeam, LEKAA_APP_URL, lookupPhone, type TeamLookup } from "@/src/api/team";
import { formatThaiMobileInput, normalizeThaiMobile } from "@/src/lib/phone";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const FIELD_H = 58;

export default function TeamAddScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenants, activeTenantId } = useAuth();
  const shop = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? "";

  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<TeamLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const seq = useRef(0);
  const e164 = normalizeThaiMobile(phone);

  // เบอร์ครบ = ค้นทันที (ครั้งเดียวต่อเบอร์ · พิมพ์ต่อ = ผลเก่าทิ้ง)
  useEffect(() => {
    setResult(null);
    setNote(null);
    if (!e164) return;
    const my = ++seq.current;
    setSearching(true);
    lookupPhone(e164)
      .then((r) => my === seq.current && setResult(r))
      .catch((e: unknown) => my === seq.current && setNote({ text: e instanceof ApiError && e.status === 403 ? t("team.add.denied") : (serverNote(e) ?? t("team.add.err")), warn: true }))
      .finally(() => my === seq.current && setSearching(false));
  }, [e164, t]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/secretary/staff"));

  const add = async () => {
    if (!e164 || !result?.found || result.member || result.invited || adding) return;
    setAdding(true);
    setNote(null);
    try {
      const r = await addToTeam(e164);
      setResult({ ...result, invited: true });
      setNote({ text: t("team.add.sent", { name: r.name || result.name }), warn: false });
    } catch (e) {
      setNote({ text: serverNote(e) ?? t("team.add.err"), warn: true });
    } finally {
      setAdding(false);
    }
  };

  const share = () => {
    void Share.share({ message: t("team.add.shareMsg", { shop, url: LEKAA_APP_URL }), url: LEKAA_APP_URL }).catch(() => undefined);
  };

  const canAdd = !!result?.found && !result.member && !result.invited && !adding;

  return (
    <AiryScreen testID="team-add">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TopBar
            testID="team-add-top"
            left={<IconBtn testID="team-add-close" icon="x" label={t("team.add.close")} onPress={close} />}
            title={t("team.add.title")}
            subtitle={shop.toUpperCase()}
            right={<View style={styles.spacer} />}
          />

          <Text style={[styles.label, { color: c.textDim }]}>{t("team.add.phone")}</Text>
          <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <TextInput
              testID="team-add-phone"
              value={phone}
              onChangeText={(v) => setPhone(formatThaiMobileInput(v))}
              placeholder={t("team.add.phonePh")}
              placeholderTextColor={c.placeholder}
              keyboardType="phone-pad"
              autoFocus
              maxLength={17}
              style={[styles.fieldT, { color: c.text }]}
            />
          </View>

          {searching ? <Text style={[styles.hint, { color: c.textMuted }]}>{t("team.add.searching")}</Text> : null}

          {result?.found ? (
            <View testID="team-add-found" style={[glassStyle(c, radii.sugg), styles.card, { borderColor: c.team.unreadBg }]}>
              <Avatar name={result.name} seed={result.name} size={52} />
              <View style={styles.cardX}>
                <Text style={[styles.cardN, { color: c.text }]} numberOfLines={1}>
                  {result.name}
                </Text>
                <Text style={[styles.cardS, { color: result.member || result.invited ? c.textMuted : c.team.unreadBg }]}>
                  {result.member ? t("team.add.member") : result.invited ? t("team.add.invited") : t("team.add.found")}
                </Text>
              </View>
            </View>
          ) : null}

          {result && !result.found ? (
            <View testID="team-add-notfound" style={[glassStyle(c, radii.sugg), styles.miss]}>
              <Text style={[styles.missT, { color: c.text }]}>{t("team.add.notFound")}</Text>
              <Pressable testID="team-add-share" accessibilityRole="button" onPress={share} style={[styles.shareBtn, { backgroundColor: c.chip.bg }]}>
                <Text style={[styles.shareT, { color: c.text }]}>{t("team.add.share")}</Text>
              </Pressable>
            </View>
          ) : null}

          {note ? (
            <Note testID="team-add-note" warn={note.warn} style={styles.note}>
              {note.text}
            </Note>
          ) : null}
          {result?.found && canAdd ? <Text style={[styles.hint, { color: c.textMuted }]}>{t("team.add.hint")}</Text> : null}
        </ScrollView>
        <View style={[styles.bottom, { paddingBottom: 18 + insets.bottom }]}>
          <PrimaryButton testID="team-add-submit" label={adding ? t("team.add.adding") : t("team.add.submit")} disabled={!canAdd} onPress={() => void add()} />
        </View>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 24 },
  spacer: { width: 44 },
  label: { fontSize: T.sub, marginTop: F.v(28), marginBottom: 8, marginLeft: 4 },
  field: { height: FIELD_H, borderRadius: radii.input / 2 + 4, borderWidth: 1, justifyContent: "center", paddingHorizontal: 20 },
  fieldT: { fontSize: T.h + 2, letterSpacing: 1, paddingVertical: 0, outlineWidth: 0 },
  hint: { fontSize: T.cap, lineHeight: 18, marginTop: 10, marginLeft: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, marginTop: 16, borderWidth: 1.5 },
  cardX: { flex: 1, minWidth: 0 },
  cardN: { fontSize: T.body + 1, fontWeight: "700", lineHeight: 24 },
  cardS: { fontSize: T.sub, lineHeight: 20, marginTop: 2 },
  miss: { padding: 18, marginTop: 16, gap: 12 },
  missT: { fontSize: T.sub + 0.5, lineHeight: 22 },
  shareBtn: { alignSelf: "flex-start", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
  shareT: { fontSize: T.sub, fontWeight: "700" },
  note: { marginTop: 14, textAlign: "left" },
  bottom: { paddingHorizontal: spacing.page, paddingTop: 8 },
});
