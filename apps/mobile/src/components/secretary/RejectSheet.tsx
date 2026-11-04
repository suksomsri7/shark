// ชีตตีกลับ (ใบ S2.4 · แบบ C4 sec-c.jpg หน้า 5) — หมายเหตุ + "แค่งานนี้" (JOB) / "จำเป็นกฎของกิจการ" (RULE)
// ชิ้นแสดงผลล้วน: สถานะ/การยิง API อยู่ใน ApprovalCard (useApprovalFlow) ที่เดียว
//   ข้อเสนอ: ช่องหมายเหตุ (ไม่บังคับสำหรับ JOB · RULE ต้องมีเหตุผล) · แผน: ไม่มีช่อง (เส้น plans/reject รับ {} เท่านั้น) ⇒ ปุ่มเดียว
import { StyleSheet, View, Pressable } from "react-native";
import { Text, TextInput } from "@/src/components/ui/text";
import { Sheet } from "@/src/components/airy";
import { useT } from "@/src/i18n";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

export type RejectChoice = "JOB" | "RULE";

export function RejectSheet({
  visible,
  mode,
  name,
  note,
  onNote,
  busy,
  error,
  onClose,
  onPick,
  testID,
}: {
  visible: boolean;
  mode: "proposal" | "plan";
  name: string;
  note: string;
  onNote: (v: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (choice: RejectChoice) => void;
  testID: string;
}) {
  const { c } = useTheme();
  const t = useT();
  const hasNote = note.trim().length > 0;
  return (
    <Sheet visible={visible} onClose={busy ? undefined : onClose} testID={testID} top={mode === "plan" ? 460 : 300}>
      <Text style={[styles.h, { color: c.text }]}>{t("sec.room.rj.title")}</Text>
      <Text style={[styles.p, { color: c.textMuted }]}>{mode === "plan" ? t("sec.room.rj.planBody", { name }) : t("sec.room.rj.body", { name })}</Text>
      {mode === "proposal" ? (
        <TextInput
          testID={`${testID}-note`}
          value={note}
          onChangeText={onNote}
          placeholder={t("sec.room.rj.note")}
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={1000}
          style={[glassStyle(c, radii.sugg), styles.note, { color: c.text }]}
        />
      ) : null}
      {error ? <Text style={[styles.err, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>{error}</Text> : null}
      <View style={styles.acts}>
        {mode === "proposal" ? (
          <>
            <Pressable
              testID={`${testID}-job`}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onPick("JOB")}
              style={[glassStyle(c, size.iconBtn / 2), styles.btn]}
            >
              <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.rj.job")}</Text>
            </Pressable>
            <Pressable
              testID={`${testID}-rule`}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !hasNote }}
              disabled={busy || !hasNote}
              onPress={() => onPick("RULE")}
              style={[styles.btn, styles.main, hasNote ? [{ backgroundColor: c.accent }, shadow(c.accentShadow)] : { backgroundColor: c.btnOff.bg }]}
            >
              <Text style={[styles.btnT, { color: hasNote ? c.onAccent : c.btnOff.fg }]}>{t("sec.room.rj.rule")}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            testID={`${testID}-plan`}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onPick("JOB")}
            style={[styles.btn, { backgroundColor: c.accent }, shadow(c.accentShadow)]}
          >
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.room.rj.planOk")}</Text>
          </Pressable>
        )}
      </View>
      {mode === "proposal" && !hasNote ? <Text style={[styles.hint, { color: c.textMuted }]}>{t("sec.room.rj.ruleHint")}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  p: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
  note: { minHeight: 96, maxHeight: 160, marginTop: spacing.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: T.body - 1, lineHeight: 22, textAlignVertical: "top", outlineWidth: 0 },
  err: { fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: spacing.md, overflow: "hidden" },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
  hint: { fontSize: T.cap, lineHeight: 18, marginTop: spacing.sm, textAlign: "center" },
});
