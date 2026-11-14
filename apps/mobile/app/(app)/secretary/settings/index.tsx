// ตั้งค่า (ใบ S2.7 · เมนูของโซนเลขา) — แถวไปหน้าย่อยส่วนตัว B2 B5 G4 + แถว "สลับกิจการ" (B1 = BusinessSwitcherSheet ของ S2.1 · ⚙ = ตั้งค่ากิจการ)
//   แบบไม่มีหน้าเมนูแยก (B2 มีแถวลิงก์ท้ายหน้า) ⇒ จอนี้ไม่มีภาพคู่ (spec pair:false) · ใช้ SecTopBar โซนเลขา
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, type IconName } from "@/src/components/airy";
import { SecTopBar, TenantTitle } from "@/src/components/secretary/SecTopBar";
import { SettingRow } from "@/src/components/secretary/SettingRow";
import { useBusinessSwitcher } from "@/src/components/secretary/BusinessSwitcherSheet";
import { DEFAULT_SECRETARY_NAME, useSecretaryMe } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { spacing, type as T } from "@/src/theme/tokens";

type Row = { key: string; icon: IconName; title: I18nKey; sub: I18nKey; path?: Href };
// 14 พ.ย. (แบบ bizgear Ⓑ): แถวที่ผูกกับกิจการ (โควตา · สิทธิ์ต่อระบบ · ต้องอนุมัติ · ความรู้ · คุยกับลูกค้า) ย้ายไป "ตั้งค่ากิจการ"
//   (/business/<id>/settings · ⚙ ในตัวสลับกิจการ) — หน้านี้เหลือของส่วนตัว: เลขาของฉัน · บัญชีของฉัน · ประวัติงานเลขา (+ แถวสลับกิจการ = ทางไป ⚙)
//   เส้นทางเดิม /secretary/settings/{quota,access,rules,knowledge,customers} ยังอยู่ครบ (ลิงก์ช่วยเหลือ/การแจ้งเตือนยังเปิดได้)
const ROWS: Row[] = [
  { key: "secretary", icon: "user", title: "sec.title.settingsSecretary", sub: "sec.set.row.secretary", path: "/secretary/settings/secretary" },
  { key: "account", icon: "user-check", title: "sec.title.settingsAccount", sub: "sec.set.row.account", path: "/secretary/settings/account" },
  { key: "log", icon: "list", title: "sec.title.settingsLog", sub: "sec.set.row.log", path: "/secretary/settings/log" },
  { key: "switch", icon: "repeat", title: "sec.set.row.switchTitle", sub: "sec.set.row.switch" },
];

export default function SecretarySettingsScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const switcher = useBusinessSwitcher();
  const sec = useSecretaryMe();
  const valueOf = (r: Row): string | undefined => (r.key === "secretary" ? (sec?.name ?? DEFAULT_SECRETARY_NAME) : undefined);

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
