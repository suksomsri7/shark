// ปฏิทินเลขา · ตั้งค่า (จอ 8 · CAL2.9) — โครงของ CAL2.1 (เนื้อหาในใบถัดไป)
import { ScrollView, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { AiryScreen } from "@/src/components/airy";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { spacing } from "@/src/theme/tokens";

export default function CalSettingsScreen() {
  const { c } = useTheme();
  const t = useT();
  return (
    <AiryScreen testID="cal-settings">
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{t("cal.set.title")}</Text>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({ page: { paddingHorizontal: spacing.page, paddingTop: 14 } });
