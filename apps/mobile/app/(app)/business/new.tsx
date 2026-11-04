// สร้างกิจการใหม่ (ใบ S2.21 · แบบ G1 sec-g.jpg หน้า 1 + sec-dark-g.jpg หน้า 1)
//   ชื่อ · ประเภท (ชิป 7 ประเภท = TENANT_TYPES) · ระบบที่จะเปิด (ติ๊ก ≤ 6 จาก TENANT_SYSTEMS) · ปุ่มสร้าง
//   ⇒ POST secretary/tenants/create {name,type,systems} (Bearer อย่างเดียว · เพดาน 3 ร้าน = 400 ข้อความไทยของเซิร์ฟเวอร์)
//   ⇒ refreshMe (รายชื่อกิจการใหม่) ⇒ switchTenant(tenant.id) ⇒ กิจการแรกของบัญชี (ยังไม่เคยตั้งชื่อเลขา) ไป /secretary/onboarding/name
//      กิจการที่ 2–3 ไปห้องแรก /secretary/room/<roomId> ถ้าเซิร์ฟเวอร์เปิดให้ ไม่งั้น /secretary
//   เข้าจาก BusinessSwitcherSheet "+ เพิ่มกิจการ" (S2.1) และจากยามหน้าประตูหลังสมัครใหม่ที่ยังไม่มีร้าน (RESOLUTIONS R-S2.12a · ธงสลับในใบนี้)
//   ผู้ที่มีคำเชิญค้างถึงเบอร์ตัวเอง เห็นการ์ด "คุณได้รับคำเชิญจาก <ร้าน>" ด้านบน (R-S1.25b · กดรับแทนการสร้างร้านใหม่)
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Chip, IconBtn, Note, PrimaryButton, TopBar } from "@/src/components/airy";
import { ReceivedInvites } from "@/src/components/secretary/InviteRow";
import { sysColor } from "@/src/components/secretary/sys";
import { ApiError } from "@/src/api/client";
import { TENANT_SYSTEMS, TENANT_SYSTEMS_MAX, TENANT_TYPES, resetSecretaryMe, secPost, serverNote, type TenantType } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { clearSignedUp } from "@/src/lib/post-signup";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const NAME_MIN = 2;
const NAME_MAX = 60;
/** ระบบ (SystemType) → โมดูลของป้ายสี (sys.ts) */
const SYS_MODULE: Record<(typeof TENANT_SYSTEMS)[number], string> = { POS: "pos", CRM: "crm", MEMBER: "member", ACCOUNT: "account", KANBAN: "kanban", CHAT: "chat", BOOKING: "booking", INVENTORY: "inventory" };
/** ระบบที่ติ๊กไว้ก่อนตามประเภท (แก้ได้) */
const PRESET: Record<TenantType, string[]> = {
  restaurant: ["POS", "CRM", "MEMBER", "ACCOUNT", "KANBAN", "CHAT"],
  retail: ["POS", "MEMBER", "INVENTORY", "ACCOUNT", "CHAT"],
  service: ["BOOKING", "CRM", "MEMBER", "ACCOUNT", "CHAT"],
  dorm: ["ACCOUNT", "CHAT", "KANBAN"],
  clinic: ["BOOKING", "MEMBER", "ACCOUNT", "CHAT"],
  education: ["CRM", "MEMBER", "ACCOUNT", "CHAT"],
  other: ["CRM", "ACCOUNT", "CHAT"],
};

export default function BusinessNewScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tenants, refreshMe, switchTenant } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<TenantType>("restaurant");
  const [systems, setSystems] = useState<string[]>(PRESET.restaurant);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const first = tenants.length === 0;

  const nameOk = Array.from(name.trim()).length >= NAME_MIN && Array.from(name.trim()).length <= NAME_MAX;
  const pickType = (k: TenantType) => {
    setType(k);
    setSystems(PRESET[k]);
  };
  const toggle = (s: string) =>
    setSystems((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= TENANT_SYSTEMS_MAX ? cur : [...cur, s]));

  const close = () => (router.canGoBack() ? router.back() : router.replace("/secretary"));

  const submit = async () => {
    if (!nameOk || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await secPost("secretary/tenants/create", { name: name.trim(), type, systems });
      await refreshMe();
      await switchTenant(r.tenant.id);
      resetSecretaryMe();
      // กิจการแรกของบัญชี = ตั้งชื่อเลขาก่อน (C1 ครั้งเดียว · ธงหลังสมัครหมดหน้าที่) · กิจการถัดไป = ห้องแรกที่เลขาเปิดให้
      if (first) {
        clearSignedUp();
        router.replace("/secretary/onboarding/name");
      } else if (r.room?.roomId) router.replace(`/secretary/room/${r.room.roomId}`);
      else router.replace("/secretary");
    } catch (e) {
      setNote(e instanceof ApiError && e.code === "rate_limited" ? t("biz.err.rate") : (serverNote(e) ?? t("biz.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  const TYPE_LABEL: Record<TenantType, I18nKey> = {
    restaurant: "biz.type.restaurant",
    retail: "biz.type.retail",
    service: "biz.type.service",
    dorm: "biz.type.dorm",
    clinic: "biz.type.clinic",
    education: "biz.type.education",
    other: "biz.type.other",
  };

  return (
    <AiryScreen testID="biz-new">
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 120 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TopBar
          testID="biz-new-top"
          left={first ? <View style={styles.spacer} /> : <IconBtn testID="biz-new-close" icon="x" label={t("biz.close")} onPress={close} />}
          title={t("biz.title")}
          right={<View style={styles.spacer} />}
        />
        <ReceivedInvites testID="biz-new-received" />

        <Text style={[styles.label, { color: c.textDim }]}>{t("biz.name")}</Text>
        <TextInput
          testID="biz-new-name"
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX + 10}
          placeholder={t("biz.namePh")}
          placeholderTextColor={c.placeholder}
          style={[styles.input, { color: c.text, backgroundColor: c.inputBg, borderColor: c.glass.border }]}
        />

        <Text style={[styles.label, { color: c.textDim }]}>{t("biz.type")}</Text>
        <View testID="biz-new-type" style={styles.chips}>
          {TENANT_TYPES.map((k) => (
            <Chip key={k} testID={`biz-new-type-${k}`} active={type === k} label={t(TYPE_LABEL[k])} onPress={() => pickType(k)} />
          ))}
        </View>

        <Text style={[styles.label, { color: c.textDim }]}>{t("biz.systems")}</Text>
        <View testID="biz-new-system" style={styles.chips}>
          {TENANT_SYSTEMS.map((s) => {
            const on = systems.includes(s);
            return (
              <Pressable
                testID={`biz-new-system-${s}`}
                key={s}
                onPress={() => toggle(s)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.sys, { backgroundColor: c.sysTag.bg }, !on && styles.sysOff]}
              >
                <View style={[styles.dot, { backgroundColor: c.sys[sysColor(SYS_MODULE[s])] }]} />
                <Text style={[styles.sysT, { color: c.sysTag.fg }]}>{t(`sec.sys.${SYS_MODULE[s]}` as I18nKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: c.textMuted }]}>{t("biz.systemsMax", { n: TENANT_SYSTEMS_MAX, k: systems.length })}</Text>
        <Text testID="biz-new-explain" style={[styles.explain, { color: c.textMuted }]}>
          {t("biz.explain")}
        </Text>
        {note ? (
          <Note warn testID="biz-new-note">
            {note}
          </Note>
        ) : null}
      </ScrollView>
      <View style={[styles.cta, { bottom: 26 + insets.bottom }]}>
        <PrimaryButton testID="biz-new-submit" label={busy ? t("biz.creating") : t("biz.submit")} disabled={!nameOk || busy} onPress={() => void submit()} />
      </View>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  spacer: { width: size.iconBtn },
  label: { fontSize: T.cap + 0.5, fontWeight: "600", marginTop: F.v(34), marginBottom: 8, marginLeft: 2 },
  input: { height: 50, borderRadius: radii.segIn + 4, borderWidth: 1, paddingHorizontal: 16, fontSize: T.body + 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sys: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 11, borderRadius: radii.tag + 1 },
  sysOff: { opacity: 0.45 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sysT: { fontSize: 12.5, fontWeight: "600" },
  hint: { fontSize: T.cap - 0.5, marginTop: 8, marginLeft: 2 },
  explain: { fontSize: T.cap, lineHeight: 19, marginTop: F.v(24) },
  cta: { position: "absolute", left: spacing.page, right: spacing.page },
});
