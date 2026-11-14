// ปฏิทินเลขา (CAL2.1 โครง · แบบ cal-1.png จอ 3/4) — แถบบน zone="calendar" · หัว "วันนี้" + เดือนปี พ.ศ. · Segment วัน/เดือน/เตือนฉัน
//   มุมมองวัน = CAL2.2 · เดือน = CAL2.3 · เตือนฉัน = CAL2.4 · ข้อมูลจาก src/api/calendar.ts (fixture ใน dev/QC ก่อน CAL1.6)
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Segment } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { dayOfMs, monthYear, ymOf } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { spacing } from "@/src/theme/tokens";

type View3 = "day" | "month" | "remind";

export default function CalendarScreen() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const [view, setView] = useState<View3>("day");
  const today = dayOfMs(Date.now());
  return (
    <AiryScreen testID="cal-screen">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <SecTopBar zone="calendar" center="none" />
        <View style={styles.hdr}>
          <Text testID="cal-title" style={[styles.h, { color: c.text }]}>{t("cal.title.today")}</Text>
          <Text style={[styles.hs, { color: c.textMuted }]}>{monthYear(ymOf(today), lang)}</Text>
        </View>
        <Segment
          testID="cal-seg"
          value={view}
          onChange={(k) => setView(k as View3)}
          options={[
            { key: "day", label: t("cal.seg.day") },
            { key: "month", label: t("cal.seg.month") },
            { key: "remind", label: t("cal.seg.remind") },
          ]}
        />
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: spacing.xxl },
  hdr: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 16, marginBottom: 14 },
  h: { fontSize: 22, fontWeight: "800" },
  hs: { fontSize: 13 },
});
