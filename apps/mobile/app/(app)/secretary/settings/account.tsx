// บัญชีของฉัน (ใบ S2.22 · แบบ G4 sec-g.jpg หน้า 4 + sec-dark-g.jpg หน้า 4) — ระดับผู้ใช้ (ตามไปทุกกิจการ)
//   เบอร์ (ยังไม่ผูก ⇒ /phone ของ S2.12 · ผูกแล้ว ⇒ เปลี่ยนต้องติดต่อทีมงาน R-S1.19e) · อีเมล (pendingEmail = ป้าย "ยังไม่ยืนยัน" R-S1.19a) · Apple ผูกแล้ว/ไม่
//   ธีม ตามระบบ/สว่าง/มืด = theme-store (คีย์ shark_theme · R-UI3) · แจ้งเตือน 4 ชนิด (GET/PUT secretary/notify · ร้านที่เลือกอยู่)
//   เข้า/ออกเวร (POST inbox/shift · สถานะ + เวลาเข้าเวรจาก GET inbox/shift · ตอบลูกค้าได้ = อยู่ใน GET inbox/staff · ไม่ได้ = ปิดใช้)
//   ลบบัญชี: preview (GET account/delete/preview) → พิมพ์คำยืนยัน → POST account/delete {confirm} → signOut · ออกจากระบบ = แตะ 2 ครั้ง
//   คำเชิญที่ส่งถึงเบอร์เรา = การ์ดรับคำเชิญ (R-S1.25b)
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Note, Segment, Sheet } from "@/src/components/airy";
import { SettingRow, SettingsTop, Toggle } from "@/src/components/secretary/SettingRow";
import { ReceivedInvites } from "@/src/components/secretary/InviteRow";
import { Avatar } from "@/src/components/secretary/MemberBubble";
import { hhmmBkk } from "@/src/components/secretary/bkk";
import {
  NOTIFY_KINDS,
  NOTIFY_MODES,
  normalizeNotify,
  secGet,
  secPost,
  secPut,
  serverNote,
  useSecretaryMe,
  type DeletePreview,
  type NotifyKind,
  type NotifyMode,
  type NotifyPrefs,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { localThaiMobile, formatThaiMobileInput } from "@/src/lib/phone";
import { THEME_MODES, setThemeMode, useThemeMode, type ThemeMode } from "@/src/lib/theme-store";
import th from "@/src/i18n/th";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

/** คำที่เซิร์ฟเวอร์ต้องการตอนลบบัญชี (route account/delete เทียบตรงตัว) — ใช้คำไทยเสมอไม่ว่าภาษาจอ */
const CONFIRM_WORD = th["acct.delete.word"];
const THEME_LABEL: Record<ThemeMode, I18nKey> = { system: "acct.theme.system", light: "acct.theme.light", dark: "acct.theme.dark" };
const KIND_LABEL: Record<NotifyKind, I18nKey> = { approval: "acct.notify.approval", room: "acct.notify.room", inbox: "acct.notify.inbox", help: "acct.notify.help" };
const MODE_LABEL: Record<NotifyMode, I18nKey> = { ALL: "acct.notify.ALL", ASSIGNED: "acct.notify.ASSIGNED", OFF: "acct.notify.OFF" };

export default function AccountScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, tenants, activeTenantId, signOut } = useAuth();
  const themeMode = useThemeMode();
  const sec = useSecretaryMe();

  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [shift, setShift] = useState<{ can: boolean; on: boolean; at: string | null } | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [outArmed, setOutArmed] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [typed, setTyped] = useState("");
  const [delNote, setDelNote] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (activeTenantId) {
        secGet("secretary/notify")
          .then((v) => live && setPrefs(normalizeNotify(v)))
          .catch(() => live && setPrefs(null));
        // S2.14: ตอบลูกค้าได้ไหม = อยู่ในรายชื่อ inbox/staff (คนที่ตอบได้) · สถานะเวร + เวลาเข้าเวร = GET inbox/shift (S1.14b)
        void Promise.allSettled([secGet("inbox/staff"), secGet("inbox/shift")]).then(([st, sh]) => {
          if (!live) return;
          const me = st.status === "fulfilled" ? (st.value.items ?? []).find((x) => x.userId === user?.id) : undefined;
          const cur = sh.status === "fulfilled" ? sh.value : null;
          setShift({ can: !!me, on: cur ? cur.onDuty : me?.onDuty === true, at: cur?.onDutyAt ?? null });
        });
      }
      return () => {
        live = false;
      };
    }, [activeTenantId, user?.id]),
  );

  const guard = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const setMode = (kind: NotifyKind, mode: NotifyMode) =>
    void guard(async () => {
      const before = prefs;
      if (prefs) setPrefs({ ...prefs, [kind]: mode });
      try {
        const r = await secPut("secretary/notify", { kind, mode });
        setPrefs(normalizeNotify(r));
      } catch (e) {
        setPrefs(before);
        setNote({ text: serverNote(e) ?? t("acct.notify.fail"), warn: true });
      }
    });

  const toggleShift = (on: boolean) =>
    void guard(async () => {
      setNote(null);
      try {
        const r = await secPost("inbox/shift", { onDuty: on });
        setShift({ can: true, on: r.onDuty, at: r.onDutyAt });
      } catch (e) {
        setNote({ text: serverNote(e) ?? t("acct.shift.fail"), warn: true });
      }
    });

  const tapPhone = () => {
    if (!user?.phone) router.push("/phone");
    else setNote({ text: t("acct.phone.locked"), warn: false });
  };

  const openDelete = () => {
    setDelOpen(true);
    setTyped("");
    setDelNote(null);
    setPreview(null);
    secGet("secretary/account/delete/preview")
      .then(setPreview)
      .catch((e) => setDelNote(serverNote(e) ?? t("acct.delete.previewFail")));
  };
  const doDelete = () =>
    void guard(async () => {
      try {
        await secPost("secretary/account/delete", { confirm: CONFIRM_WORD });
        setDelOpen(false);
        await signOut(); // ยามหน้าประตูพาไป /login
      } catch (e) {
        setDelNote(serverNote(e) ?? t("acct.delete.fail"));
      }
    });

  const logout = () => {
    if (!outArmed) {
      setOutArmed(true);
      return;
    }
    void signOut();
  };

  const owned = tenants.filter((x) => x.role === "OWNER").length;
  const staffOf = tenants.length - owned;
  const roles = [...(owned ? [t("acct.ownerOf", { n: owned })] : []), ...(staffOf ? [t("acct.staffOf", { n: staffOf })] : [])].join(" · ");
  const phoneText = user?.phone ? formatThaiMobileInput(localThaiMobile(user.phone) ?? user.phone) : t("acct.phone.none");
  const emailText = user?.email ?? user?.pendingEmail ?? t("acct.email.none");
  const emailPending = !user?.email && !!user?.pendingEmail;
  const apple = user?.appleLinked === true ? t("acct.apple.yes") : user?.appleLinked === false ? t("acct.apple.no") : t("acct.apple.unknown");
  const notifySummary = useMemo(() => {
    if (!prefs) return "";
    const on = NOTIFY_KINDS.filter((k) => prefs[k] !== "OFF").map((k) => t(KIND_LABEL[k]));
    return on.length ? on.join(" · ") : t("acct.notify.allOff");
  }, [prefs, t]);
  const shiftText = !shift ? "" : !shift.can ? t("acct.shift.cannot") : shift.on ? (shift.at ? t("acct.shift.onAt", { time: hhmmBkk(shift.at) }) : t("acct.shift.on")) : t("acct.shift.off");
  const lang = (sec?.languages?.[0] ?? "th") === "en" ? t("sec.me.lang.en") : t("sec.me.lang.th");
  const typedOk = typed.trim() === CONFIRM_WORD;
  const list = (rows: { name: string }[] | undefined) => (rows ?? []).map((r) => r.name).join(", ");

  return (
    <AiryScreen testID="acct">
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SettingsTop testID="acct-top" title={t("sec.title.settingsAccount")} />
        <View style={styles.hero}>
          <Avatar name={user?.name ?? ""} seed={user?.id ?? ""} size={38} />
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
            {user?.name || t("acct.noName")}
          </Text>
          {roles ? <Text style={[styles.sub, { color: c.textMuted }]}>{roles}</Text> : null}
        </View>
        <ReceivedInvites testID="acct-received" />

        <SettingRow testID="acct-phone" title={t("acct.phone")} value={phoneText} onPress={tapPhone} />
        <SettingRow testID="acct-email" title={t("acct.email")} value={emailText} sub={emailPending ? t("acct.email.pending") : undefined} />
        <SettingRow testID="acct-apple" title={t("acct.apple")} value={apple} />

        <Text style={[styles.label, { color: c.textDim }]}>{t("acct.theme")}</Text>
        <Segment testID="acct-theme" value={themeMode} onChange={(k) => void setThemeMode(k as ThemeMode)} options={THEME_MODES.map((m) => ({ key: m, label: t(THEME_LABEL[m]) }))} />

        <View style={styles.gap} />
        {activeTenantId ? <SettingRow testID="acct-notify" title={t("acct.notify")} value={notifySummary} onPress={() => setNotifyOpen(true)} /> : null}
        <SettingRow testID="acct-lang" title={t("acct.lang")} value={lang} onPress={() => router.push("/secretary/settings/secretary")} />
        {activeTenantId ? (
          <SettingRow testID="acct-shift" title={t("acct.shift")} value={shiftText}>
            <Toggle testID="acct-shift-toggle" value={!!shift?.on} disabled={!shift?.can || busy} label={t("acct.shift")} onChange={toggleShift} />
          </SettingRow>
        ) : null}

        {note ? (
          <Note warn={note.warn} testID="acct-note">
            {note.text}
          </Note>
        ) : null}

        <View style={styles.acts}>
          <Pressable testID="acct-logout" accessibilityRole="button" onPress={logout} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{outArmed ? t("acct.logoutAgain") : t("acct.logout")}</Text>
          </Pressable>
          <Pressable testID="acct-delete" accessibilityRole="button" onPress={openDelete} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.bad.fg }]}>{t("acct.delete")}</Text>
          </Pressable>
        </View>
        <Text style={[styles.foot, { color: c.textMuted }]}>{t("acct.deleteFoot")}</Text>
      </ScrollView>

      <Sheet visible={notifyOpen} onClose={() => setNotifyOpen(false)} testID="acct-notify-sheet" top={300}>
        <Text style={[styles.sh, { color: c.text }]}>{t("acct.notify")}</Text>
        <Text style={[styles.sb, { color: c.textMuted }]}>{t("acct.notify.sub")}</Text>
        {NOTIFY_KINDS.map((k) => (
          <View key={k} style={styles.kind}>
            <Text style={[styles.kindT, { color: c.textDim }]}>{t(KIND_LABEL[k])}</Text>
            <Segment testID={`acct-notify-${k}`} value={prefs?.[k] ?? "ALL"} onChange={(m) => setMode(k, m as NotifyMode)} options={NOTIFY_MODES.map((m) => ({ key: m, label: t(MODE_LABEL[m]) }))} />
          </View>
        ))}
      </Sheet>

      <Sheet visible={delOpen} onClose={() => setDelOpen(false)} testID="acct-delete-sheet" top={250}>
        <Text style={[styles.sh, { color: c.text }]}>{t("acct.delete.title")}</Text>
        <Text testID="acct-delete-preview" style={[styles.sb, { color: c.textMuted }]}>
          {!preview
            ? t("acct.delete.loading")
            : [
                preview.tenantsToDelete?.length ? t("acct.delete.toDelete", { list: list(preview.tenantsToDelete) }) : null,
                preview.tenantsHandedOver?.length
                  ? t("acct.delete.handedOver", {
                      list: preview.tenantsHandedOver.map((x) => (x.newOwner ? t("acct.delete.toOwner", { name: x.name, owner: x.newOwner }) : x.name)).join(", "),
                    })
                  : null,
                preview.tenantsLeftAlone?.length ? t("acct.delete.leftAlone", { list: list(preview.tenantsLeftAlone) }) : null,
                t("acct.delete.personal"),
              ]
                .filter(Boolean)
                .join("\n")}
        </Text>
        <Text style={[styles.kindT, { color: c.textDim }]}>{t("acct.delete.type", { word: CONFIRM_WORD })}</Text>
        <TextInput
          testID="acct-delete-input"
          value={typed}
          onChangeText={setTyped}
          placeholder={CONFIRM_WORD}
          placeholderTextColor={c.placeholder}
          style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
        />
        {delNote ? (
          <Note warn testID="acct-delete-note">
            {delNote}
          </Note>
        ) : null}
        <View style={styles.acts}>
          <Pressable testID="acct-delete-cancel" accessibilityRole="button" onPress={() => setDelOpen(false)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("perm.keep")}</Text>
          </Pressable>
          <Pressable
            testID="acct-delete-confirm"
            accessibilityRole="button"
            accessibilityState={{ disabled: !typedOk || !preview || busy }}
            disabled={!typedOk || !preview || busy}
            onPress={doDelete}
            style={[styles.btn, styles.main, { backgroundColor: typedOk && preview ? c.bad.fg : c.btnOff.bg }]}
          >
            <Text style={[styles.btnT, { color: typedOk && preview ? c.onAccent : c.btnOff.fg }]}>{busy ? t("acct.delete.deleting") : t("acct.delete.ok")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  hero: { alignItems: "center", marginTop: F.v(10), marginBottom: 6 },
  name: { fontSize: T.lt - 2, fontWeight: "700", marginTop: 10, lineHeight: 30 },
  sub: { fontSize: T.sub - 0.5, marginTop: 4, textAlign: "center" },
  label: { fontSize: T.cap, marginTop: F.v(26), marginBottom: 6, marginLeft: 2 },
  gap: { height: 4 },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn + 2, borderRadius: (size.iconBtn + 2) / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.4 },
  btnT: { fontSize: T.sub + 0.5, fontWeight: "700" },
  foot: { fontSize: T.cap - 1, lineHeight: 18, marginTop: 10, textAlign: "center" },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  sb: { fontSize: T.sub, lineHeight: 21, marginTop: 6, marginBottom: 6 },
  kind: { marginTop: 12, gap: 6 },
  kindT: { fontSize: T.cap, fontWeight: "600", marginTop: 6 },
  input: { height: 48, borderRadius: radii.segIn + 4, borderWidth: 1, paddingHorizontal: 14, fontSize: T.body, marginTop: 6 },
});
