// ตัวเลือกระดับเลขาต่อระบบ (แบบ B3 sec-b.jpg หน้า 3) — 3 ระดับที่ตั้งได้ (ปิด · ดูอย่างเดียว · ร่าง+รออนุมัติ)
// + ขั้นที่ 4 "ทำเองได้" แสดงจางและกดไม่ได้เสมอ (รุ่นแรกไม่มีใน API · มติเจ้าของ 5) · `readOnly` = แสดงระดับแต่กดไม่ได้ (ไม่ใช่เจ้าของ)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { ACCESS_LEVELS, type AccessLevel } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

const LABEL: Record<AccessLevel, I18nKey> = { OFF: "sec.access.level.off", READ: "sec.access.level.read", DRAFT: "sec.access.level.draft" };

export function LevelPicker({ testID, value, onChange, readOnly = false }: { testID: string; value: string; onChange?: (l: AccessLevel) => void; readOnly?: boolean }) {
  const { c } = useTheme();
  const t = useT();
  return (
    <View testID={testID} style={styles.row}>
      {ACCESS_LEVELS.map((l) => {
        const on = l === value;
        return (
          <Pressable
            testID={`${testID}-${l}`}
            key={l}
            disabled={readOnly}
            onPress={() => !on && onChange?.(l)}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: readOnly }}
            style={[styles.opt, { backgroundColor: on ? c.accent : c.chip.bg }]}
          >
            <Text style={[styles.t, { color: on ? c.onAccent : c.textDim }, on && styles.on]} numberOfLines={1}>
              {t(LABEL[l])}
            </Text>
          </Pressable>
        );
      })}
      <View testID={`${testID}-auto`} accessibilityState={{ disabled: true }} style={[styles.opt, styles.locked, { backgroundColor: c.chip.bg }]}>
        <Text style={[styles.t, { color: c.textFaint }]} numberOfLines={1}>
          {t("sec.access.level.auto")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, marginTop: 8 },
  opt: { flex: 1, height: 32, borderRadius: radii.segIn - 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  locked: { opacity: 0.5 },
  t: { fontSize: 11.5 },
  on: { fontWeight: "700" },
});
