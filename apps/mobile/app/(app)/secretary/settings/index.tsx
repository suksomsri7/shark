// ตั้งค่า (ใบ S2.7 · เมนูของโซนเลขา) — แถวไปหน้าย่อย B2 B8 B3 B4 B5 B6 B7 G4 + แถว "สลับกิจการ" (B1 = BusinessSwitcherSheet ของ S2.1)
//   แบบไม่มีหน้าเมนูแยก (B2 มีแถวลิงก์ท้ายหน้า) ⇒ จอนี้ไม่มีภาพคู่ (spec pair:false) · ใช้ SecTopBar โซนเลขา
//   หน้าที่เป็นของเจ้าของ (สิทธิ์ต่อระบบ · ต้องอนุมัติเสมอ · คุยกับลูกค้า) แสดงป้าย "เจ้าของเท่านั้น" เมื่อบทบาทไม่ใช่ OWNER (เปิดดูได้)
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, type IconName } from "@/src/components/airy";
import { SecTopBar, TenantTitle } from "@/src/components/secretary/SecTopBar";
import { SettingRow } from "@/src/components/secretary/SettingRow";
import { useBusinessSwitcher } from "@/src/components/secretary/BusinessSwitcherSheet";
import { DEFAULT_SECRETARY_NAME, quotaNumbers, secGet, useActiveRole, useSecretaryMe } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { spacing, type as T } from "@/src/theme/tokens";

type Row = { key: string; icon: IconName; title: I18nKey; sub: I18nKey; path?: Href; owner?: boolean };
const ROWS: Row[] = [
  { key: "secretary", icon: "user", title: "sec.title.settingsSecretary", sub: "sec.set.row.secretary", path: "/secretary/settings/secretary" },
  { key: "quota", icon: "pie-chart", title: "sec.title.settingsQuota", sub: "sec.set.row.quota", path: "/secretary/settings/quota" },
  { key: "access", icon: "sliders", title: "sec.title.settingsAccess", sub: "sec.set.row.access", path: "/secretary/settings/access", owner: true },
  { key: "rules", icon: "shield", title: "sec.title.settingsRules", sub: "sec.set.row.rules", path: "/secretary/settings/rules", owner: true },
  { key: "log", icon: "list", title: "sec.title.settingsLog", sub: "sec.set.row.log", path: "/secretary/settings/log" },
  { key: "knowledge", icon: "book-open", title: "sec.title.settingsKnowledge", sub: "sec.set.row.knowledge", path: "/secretary/settings/knowledge" },
  { key: "customers", icon: "message-square", title: "sec.title.settingsCustomers", sub: "sec.set.row.customers", path: "/secretary/settings/customers", owner: true },
  { key: "account", icon: "user-check", title: "sec.title.settingsAccount", sub: "sec.set.row.account", path: "/secretary/settings/account" },
  { key: "switch", icon: "repeat", title: "sec.set.row.switchTitle", sub: "sec.set.row.switch" },
];

export default function SecretarySettingsScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const switcher = useBusinessSwitcher();
  const role = useActiveRole();
  const sec = useSecretaryMe();
  const { activeTenantId } = useAuth();
  const [pct, setPct] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!activeTenantId) return;
      let live = true;
      secGet("secretary/quota")
        .then((q) => live && setPct(quotaNumbers(q).pct))
        .catch(() => live && setPct(null));
      return () => {
        live = false;
      };
    }, [activeTenantId]),
  );

  const owner = role === "OWNER";
  const valueOf = (r: Row): string | undefined => {
    if (r.key === "secretary") return sec?.name ?? DEFAULT_SECRETARY_NAME;
    if (r.key === "quota" && pct !== null) return t("sec.set.pct", { n: pct });
    if (r.owner && !owner) return t("sec.set.ownerOnlyShort");
    return undefined;
  };

  return (
    <AiryScreen testID="sec-settings">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        {/* S2.20 (Q-8): ชื่อกิจการไม่อัดอยู่กลางแถบ 5 ปุ่ม (ถูกตัด) — วางเต็มบรรทัดใต้แถบ แบบหน้า K */}
        <SecTopBar zone="secretary" center="none" />
        <View style={styles.tenant}>
          <TenantTitle />
        </View>
        <Text testID="sec-settings-title" style={[styles.h, { color: c.text }]}>
          {t("sec.title.settings")}
        </Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>{t("sec.set.sub", { name: sec?.name ?? DEFAULT_SECRETARY_NAME })}</Text>
        <View style={styles.list}>
          {ROWS.map((r) => (
            <SettingRow
              key={r.key}
              testID={`sec-settings-row-${r.key}`}
              icon={r.icon}
              title={t(r.title)}
              sub={t(r.sub)}
              value={valueOf(r)}
              onPress={() => (r.path ? router.push(r.path) : switcher.open())}
            />
          ))}
        </View>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  tenant: { marginTop: 14 },
  h: { fontSize: T.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: F.v(19) },
  sub: { fontSize: T.sub, lineHeight: 20, marginTop: 4 },
  list: { marginTop: F.v(20) },
});
