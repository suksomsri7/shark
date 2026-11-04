// ข้อเสนอของเลขา (GET secretary/suggestions) — การ์ดกระจก: ป้ายย่อระบบ (SysBadge) · หัวข้อ · คำสั่งเต็ม 1 บรรทัด · ลูกศร
// ใช้ใน A2 (แตะ = เติมคำสั่งลงช่องพิมพ์ ไม่ส่งเอง · มติ 9) · testID ของแถว = `<testID>-<key>`
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, SysBadge } from "@/src/components/airy";
import type { Suggestion } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";
import { sysName } from "./RoomCard";
import { sysColor } from "./sys";

export function SuggestionList({ items, testID, onPick }: { items: Suggestion[]; testID: string; onPick: (s: Suggestion) => void }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID}>
      {items.map((s) => (
        <Pressable
          testID={`${testID}-${s.key}`}
          key={s.key}
          accessibilityRole="button"
          accessibilityHint={s.instruction}
          onPress={() => onPick(s)}
          style={[glassStyle(c, radii.sugg), styles.row]}
        >
          <SysBadge sys={sysColor(s.system)} label={sysName(t, s.system)} />
          <View style={styles.x}>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {s.title}
            </Text>
            <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={1}>
              {s.instruction}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: F.v(16), paddingHorizontal: F.v(22), marginTop: F.v(11) },
  x: { flex: 1, minWidth: 0 },
  title: { fontSize: T.sub, lineHeight: 20 },
  sub: { fontSize: T.cap, lineHeight: 17, marginTop: 1 },
});
