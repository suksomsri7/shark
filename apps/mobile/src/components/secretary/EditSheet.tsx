// ชีตแก้ก่อนอนุมัติ (ใบ S2.4 · A4 ปุ่ม "แก้" · allowlist S2.10 R-S2.4d) — ช่องของ `input` ระดับบน (ข้อความ/ตัวเลข) ที่มีป้าย sec.field.* ของข้อเสนอที่แก้ได้ (kind ทะเบียน op · S1.10 Q9)
// ชิ้นแสดงผลล้วน: ค่าที่พิมพ์ + การยิง `proposals/[id]/edit {patch}` อยู่ใน ApprovalCard (useApprovalFlow)
//   ช่องที่เป็น object/array แก้ในแอปไม่ได้ (ไม่แสดง) · chat.send ไม่มีปุ่มแก้ตั้งแต่ต้น (editable=false · §M)
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/src/components/ui/text";
import { Sheet } from "@/src/components/airy";
import { useT, type I18nKey } from "@/src/i18n";
import th from "@/src/i18n/th";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

/** คีย์ที่มีป้าย `sec.field.<key>` ใน i18n = allowlist (R-S2.4d) — คีย์อื่น (id ดิบ เช่น boardId/contactId) ไม่แสดงและแก้ไม่ได้ */
export function hasFieldLabel(key: string): boolean {
  return `sec.field.${key}` in th;
}

/** ช่องที่แก้ได้ของ input (string / number ระดับบน · เฉพาะคีย์ใน allowlist) */
export function editableFields(input: Record<string, unknown> | null): { key: string; numeric: boolean; value: string }[] {
  if (!input) return [];
  return Object.entries(input)
    .filter(([k, v]) => (typeof v === "string" || typeof v === "number") && hasFieldLabel(k))
    .map(([key, v]) => ({ key, numeric: typeof v === "number", value: String(v) }));
}

export function fieldLabel(t: ReturnType<typeof useT>, key: string): string {
  return hasFieldLabel(key) ? t(`sec.field.${key}` as I18nKey) : key;
}

export function EditSheet({
  visible,
  fields,
  values,
  onChange,
  busy,
  error,
  onClose,
  onSave,
  testID,
}: {
  visible: boolean;
  fields: { key: string; numeric: boolean; value: string }[];
  values: Record<string, string>;
  onChange: (key: string, v: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  testID: string;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Sheet visible={visible} onClose={busy ? undefined : onClose} testID={testID} top={260}>
      <Text style={[styles.h, { color: c.text }]}>{t("sec.room.ed.title")}</Text>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {fields.length === 0 ? <Text style={[styles.none, { color: c.textMuted }]}>{t("sec.room.ed.none")}</Text> : null}
        {fields.map((f) => (
          <View key={f.key} style={styles.row}>
            <Text style={[styles.label, { color: c.textMuted }]}>{fieldLabel(t, f.key)}</Text>
            <TextInput
              testID={`${testID}-field-${f.key}`}
              value={values[f.key] ?? f.value}
              onChangeText={(v) => onChange(f.key, v)}
              keyboardType={f.numeric ? "decimal-pad" : "default"}
              multiline={!f.numeric}
              style={[glassStyle(c, radii.k + 4), styles.field, { color: c.text }]}
            />
          </View>
        ))}
      </ScrollView>
      {error ? <Text style={[styles.err, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>{error}</Text> : null}
      <View style={styles.acts}>
        <Pressable testID={`${testID}-cancel`} accessibilityRole="button" disabled={busy} onPress={onClose} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
          <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.ed.cancel")}</Text>
        </Pressable>
        <Pressable
          testID={`${testID}-save`}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || fields.length === 0 }}
          disabled={busy || fields.length === 0}
          onPress={onSave}
          style={[styles.btn, styles.main, fields.length > 0 ? [{ backgroundColor: c.accent }, shadow(c.accentShadow)] : { backgroundColor: c.btnOff.bg }]}
        >
          <Text style={[styles.btnT, { color: fields.length > 0 ? c.onAccent : c.btnOff.fg }]}>{t("sec.room.ed.save")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  list: { flexGrow: 0, flexShrink: 1, marginTop: spacing.sm },
  none: { fontSize: T.sub, lineHeight: 21, marginTop: spacing.sm },
  row: { marginTop: spacing.md },
  label: { fontSize: T.cap, marginBottom: 6, marginLeft: 4 },
  field: { minHeight: size.iconBtn, paddingVertical: 10, paddingHorizontal: 14, fontSize: T.body - 1, lineHeight: 22, outlineWidth: 0 },
  err: { fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: spacing.md, overflow: "hidden" },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
});
