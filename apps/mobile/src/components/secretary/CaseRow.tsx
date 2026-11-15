// การ์ดเคสในรายการช่วยเหลือ (help-cases · 15 พ.ย. 2026 · จอ 1 ของแบบ /root/mockups/secretary-help/help.png)
//   "#SHARK-000124 · 10 นาที" + ตัวเลขแดงข้อความทีมที่ยังไม่อ่าน · หัวเรื่อง · ● ขั้น (สีของขั้น) · แถบความคืบหน้า 5 ช่อง
//   แตะ = เปิดห้องเคส · เวลาสัมพัทธ์ = helpTime (นาที · ชม. · เมื่อวาน · N วัน · d เดือน)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { StageBar, StageLine, helpTime, stageLabelKey } from "@/src/components/secretary/HelpStage";
import { caseNoText, type HelpCaseRow } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

export function CaseRow({ item, nowMs, testID, onPress }: { item: HelpCaseRow; nowMs: number; testID: string; onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const time = helpTime(t, item.updatedAt, nowMs);
  const no = `#${caseNoText(item.caseNo)}`;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[t("help.caseA11y", { no, subject: item.subject, stage: t(stageLabelKey(item.stage)) }), item.unread > 0 ? t("help.unread", { n: item.unread }) : ""].filter(Boolean).join(" · ")}
      onPress={onPress}
      style={[glassStyle(c, radii.sugg), styles.card]}
    >
      <View style={styles.top}>
        <Text testID={`${testID}-no`} style={[styles.no, { color: c.textMuted }]} numberOfLines={1}>
          {time ? `${no} · ${time}` : no}
        </Text>
        {item.unread > 0 ? (
          <View testID={`${testID}-unread`} style={[styles.badge, { backgroundColor: c.helpStage.unread }]}>
            <Text style={[styles.badgeT, { color: c.onSys }]}>{item.unread > 99 ? "99+" : String(item.unread)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.subject, { color: c.text }]} numberOfLines={2}>
        {item.subject}
      </Text>
      <View style={styles.stage}>
        <StageLine stage={item.stage} testID={`${testID}-stage-${item.stage}`} />
      </View>
      <StageBar stage={item.stage} step={item.stageStep} testID={`${testID}-bar`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14, paddingHorizontal: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  no: { flex: 1, minWidth: 0, fontSize: T.cap - 0.5, lineHeight: 17 },
  subject: { fontSize: T.body, fontWeight: "700", lineHeight: 23, marginTop: 4 },
  stage: { marginTop: 6 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
});
