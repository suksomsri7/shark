// โครงจอของแอปเลขา (ใบ S2.1) — พื้น Airy + แถบบนตามโซน + หัวข้อ + การ์ด "กำลังสร้าง (ใบ S2.x)" · ไม่เรียก API ของจอ
// ใบที่วาดจอจริงแทนที่การเรียก SecSkeleton ในไฟล์จอของตัวเอง (ตารางเส้นทาง: docs/modules/31-secretary.md §2.3)
import { ScrollView, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass } from "@/src/components/airy";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { spacing, type as T } from "@/src/theme/tokens";
import { SecTopBar, type SecZone } from "./SecTopBar";

export function SecSkeleton({ testID, zone, title, wo, page }: { testID: string; zone: SecZone; title: I18nKey; wo: string; page: string }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <AiryScreen testID={testID}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SecTopBar zone={zone} />
        <Text testID={`${testID}-title`} style={[styles.h, { color: c.text }]}>
          {t(title)}
        </Text>
        <Glass testID={`${testID}-building`} style={styles.card}>
          <Text style={[styles.ct, { color: c.text }]}>{t("sec.building.title", { wo })}</Text>
          <Text style={[styles.cs, { color: c.textMuted }]}>{t("sec.building.body", { wo, page })}</Text>
        </Glass>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: F.v(19), paddingBottom: spacing.xxl },
  h: { fontSize: T.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 42, marginTop: F.v(19) },
  card: { marginTop: F.v(33) },
  ct: { fontSize: T.h, fontWeight: "600", lineHeight: 24 },
  cs: { fontSize: T.sub, lineHeight: 20, marginTop: spacing.xs },
});
