// ปฏิทินเลขา · Google Calendar (จอ 9 · CAL2.10) — โครงของ CAL2.1 (เนื้อหาในใบถัดไป)
import { ScrollView, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { AiryScreen } from "@/src/components/airy";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { spacing } from "@/src/theme/tokens";

export default function CalGoogleScreen() {
  const { c } = useTheme();
  const t = useT();
  return (
    <AiryScreen testID="cal-google">
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{t("cal.g.title")}</Text>
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({ page: { paddingHorizontal: spacing.page, paddingTop: 14 } });
